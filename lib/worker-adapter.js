import { IncomingMessage, ServerResponse } from 'node:http';
import { EventEmitter } from 'node:events';
import { Readable, PassThrough } from 'node:stream';

/**
 * Minimal, zero-external-dependency Fetch <-> Express adapter for Cloudflare Workers.
 * Converts standard Web Fetch Request to Node.js IncomingMessage / ServerResponse,
 * runs the Express application, and resolves to a Web Fetch Response.
 */
export function handleFetchWithExpress(app, request, env = {}, ctx = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      const url = new URL(request.url);

      // Create a mock socket with remote client IP and encrypted transport flag
      const clientIp = request.headers.get('cf-connecting-ip') ||
                       request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                       '127.0.0.1';

      const socket = new EventEmitter();
      socket.encrypted = url.protocol === 'https:';
      socket.remoteAddress = clientIp;
      socket.remotePort = 443;
      socket.destroy = () => {};
      socket.on = EventEmitter.prototype.on;
      socket.emit = EventEmitter.prototype.emit;
      socket.removeListener = EventEmitter.prototype.removeListener;

      // Create Node IncomingMessage
      const req = new IncomingMessage(socket);
      req.method = request.method;
      req.url = url.pathname + url.search;
      req.httpVersion = '1.1';
      req.httpVersionMajor = 1;
      req.httpVersionMinor = 1;
      req.headers = {};
      req.rawHeaders = [];

      for (const [key, value] of request.headers.entries()) {
        const lowerKey = key.toLowerCase();
        req.headers[lowerKey] = value;
        req.rawHeaders.push(key, value);
      }

      // Attach Cloudflare Worker environment context
      req.env = env;
      req.ctx = ctx;
      try {
        if (!req.socket) Object.defineProperty(req, 'socket', { value: socket, configurable: true, writable: true });
      } catch (_) {}
      try {
        if (!req.connection) Object.defineProperty(req, 'connection', { value: socket, configurable: true, writable: true });
      } catch (_) {}

      // Capture raw body buffer before body parsing (critical for ECPay signature validation)
      let rawBodyBuffer = null;
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        const arrayBuffer = await request.arrayBuffer();
        rawBodyBuffer = Buffer.from(arrayBuffer);
        req.rawFormBody = rawBodyBuffer;
      }

      // Create native Web TransformStream for zero-copy streaming and SSE
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const textEncoder = new TextEncoder();
      let streamClosed = false;
      let headersSent = false;
      let statusCode = 200;
      let statusMessage = 'OK';
      const responseHeaders = new Headers();

      // Create Node ServerResponse
      const res = new ServerResponse(req);
      try {
        if (!res.socket) Object.defineProperty(res, 'socket', { value: socket, configurable: true, writable: true });
      } catch (_) {}
      try {
        if (!res.connection) Object.defineProperty(res, 'connection', { value: socket, configurable: true, writable: true });
      } catch (_) {}
      Object.defineProperty(res, 'headersSent', {
        get: () => headersSent,
        configurable: true
      });

      res.writeHead = function (code, reason, obj) {
        let headers;
        if (typeof reason === 'string') {
          statusCode = code;
          statusMessage = reason;
          headers = obj;
        } else {
          statusCode = code;
          headers = reason;
        }

        if (headers) {
          if (Array.isArray(headers)) {
            for (let i = 0; i < headers.length; i += 2) {
              responseHeaders.append(headers[i], headers[i + 1]);
            }
          } else {
            for (const [k, v] of Object.entries(headers)) {
              if (Array.isArray(v)) {
                for (const item of v) responseHeaders.append(k, item);
              } else if (v !== undefined) {
                responseHeaders.set(k, String(v));
              }
            }
          }
        }
        return res;
      };

      res.setHeader = function (name, value) {
        if (Array.isArray(value)) {
          responseHeaders.delete(name);
          for (const item of value) responseHeaders.append(name, item);
        } else if (value !== undefined) {
          responseHeaders.set(name, String(value));
        }
        return res;
      };

      res.getHeader = function (name) {
        return responseHeaders.get(name);
      };

      res.getHeaders = function () {
        const result = {};
        for (const [k, v] of responseHeaders.entries()) {
          result[k] = v;
        }
        return result;
      };

      res.hasHeader = function (name) {
        return responseHeaders.has(name);
      };

      res.removeHeader = function (name) {
        responseHeaders.delete(name);
      };

      res.flushHeaders = function () {
        sendResponseOnce();
      };

      res.sendFile = async function (filePath, options, callback) {
        if (typeof options === 'function') {
          callback = options;
          options = {};
        }
        try {
          const fileName = filePath.split(/[/\\]/).pop();
          if (env && env.ASSETS) {
            const assetUrl = new URL(`/${fileName}`, request.url);
            const assetReq = new Request(assetUrl.toString(), {
              method: 'GET',
              headers: { 'Accept': 'text/html,*/*' }
            });
            const assetRes = await env.ASSETS.fetch(assetReq);
            if (assetRes.ok) {
              if (!responseHeaders.has('content-type')) {
                responseHeaders.set('content-type', 'text/html; charset=utf-8');
              }
              const content = await assetRes.arrayBuffer();
              res.statusCode = 200;
              res.end(Buffer.from(content));
              if (callback) callback(null);
              return res;
            }
          }

          const fs = await import('node:fs/promises');
          const content = await fs.readFile(filePath);
          if (!responseHeaders.has('content-type')) {
            responseHeaders.set('content-type', 'text/html; charset=utf-8');
          }
          res.statusCode = 200;
          res.end(content);
          if (callback) callback(null);
        } catch (err) {
          if (callback) {
            callback(err);
          } else {
            res.statusCode = 404;
            res.end('Not Found');
          }
        }
        return res;
      };

      function sendResponseOnce() {
        if (headersSent) return;
        headersSent = true;

        const isHead = req.method === 'HEAD';
        const body = isHead ? null : readable;

        const currentStatus = res.statusCode || statusCode || 200;
        const response = new Response(body, {
          status: currentStatus,
          statusText: res.statusMessage || statusMessage || (currentStatus === 404 ? 'Not Found' : 'OK'),
          headers: responseHeaders
        });

        resolve(response);
      }

      res.write = function (chunk, encoding, callback) {
        if (!headersSent) sendResponseOnce();
        if (streamClosed) return false;
        const data = typeof chunk === 'string' ? textEncoder.encode(chunk) : chunk;
        writer.write(data).catch(() => {
          streamClosed = true;
        });
        if (typeof callback === 'function') callback();
        return true;
      };

      res.end = function (chunk, encoding, callback) {
        if (chunk && !streamClosed) {
          const data = typeof chunk === 'string' ? textEncoder.encode(chunk) : chunk;
          writer.write(data).catch(() => {});
        }
        if (!headersSent) sendResponseOnce();
        if (!streamClosed) {
          streamClosed = true;
          writer.close().catch(() => {});
        }
        if (typeof callback === 'function') callback();
        return res;
      };

      // Pipe raw body into request stream if body was provided
      if (rawBodyBuffer && rawBodyBuffer.length > 0) {
        req.push(rawBodyBuffer);
      }
      req.push(null);

      // Execute Express application
      app(req, res, async (err) => {
        if (err) {
          reject(err);
        } else if (!headersSent && !res.writableEnded) {
          // If express didn't handle the request and env.ASSETS is available, try env.ASSETS!
          if (env && env.ASSETS && request.method === 'GET') {
            const parsedPath = url.pathname.replace(/\/+$/, '');
            // Do NOT serve protected static pages directly from ASSETS (enforce 404)
            if (['/admin.html', '/overlay.html', '/donate.html'].includes(parsedPath)) {
              res.statusCode = 404;
              res.end('Not Found');
              return;
            }
            try {
              const assetRes = await env.ASSETS.fetch(request);
              if (assetRes.status !== 404) {
                resolve(assetRes);
                return;
              }
            } catch (_) {}
          }
          res.statusCode = 404;
          res.end('Not Found');
        }
      });

    } catch (err) {
      reject(err);
    }
  });
}
