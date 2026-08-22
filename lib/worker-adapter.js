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

      // Capture raw body buffer before body parsing (critical for ECPay signature validation)
      let rawBodyBuffer = null;
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        const arrayBuffer = await request.arrayBuffer();
        rawBodyBuffer = Buffer.from(arrayBuffer);
        req.rawFormBody = rawBodyBuffer;
      }

      // Create PassThrough response stream
      const responseBodyStream = new PassThrough();
      let headersSent = false;
      let statusCode = 200;
      let statusMessage = 'OK';
      const responseHeaders = new Headers();

      // Create Node ServerResponse
      const res = new ServerResponse(req);
      res.assignSocket(socket);

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

      function sendResponseOnce() {
        if (headersSent) return;
        headersSent = true;

        const isHead = req.method === 'HEAD';
        const body = isHead ? null : Readable.toWeb(responseBodyStream);

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
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding || 'utf-8');
        return responseBodyStream.write(buffer, callback);
      };

      res.end = function (chunk, encoding, callback) {
        if (chunk) {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding || 'utf-8');
          responseBodyStream.write(buffer);
        }
        if (!headersSent) sendResponseOnce();
        responseBodyStream.end(callback);
        return res;
      };

      // Pipe raw body into request stream if body was provided
      if (rawBodyBuffer && rawBodyBuffer.length > 0) {
        req.push(rawBodyBuffer);
      }
      req.push(null);

      // Execute Express application
      app(req, res, (err) => {
        if (err) {
          reject(err);
        } else if (!headersSent && !res.writableEnded) {
          res.statusCode = 404;
          res.end('Not Found');
        }
      });

    } catch (err) {
      reject(err);
    }
  });
}
