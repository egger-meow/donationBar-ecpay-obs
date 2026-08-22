import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import bodyParser from 'body-parser';
import { handleFetchWithExpress } from '../lib/worker-adapter.js';

test('handleFetchWithExpress handles GET requests and returns JSON response', async () => {
  const app = express();
  app.get('/api/test', (req, res) => {
    res.setHeader('X-Custom-Header', 'custom-value');
    res.json({ message: 'hello from worker', ip: req.socket.remoteAddress });
  });

  const request = new Request('https://donatio.jjmowlab.com/api/test', {
    method: 'GET',
    headers: {
      'CF-Connecting-IP': '203.0.113.195',
      'User-Agent': 'TestRunner/1.0'
    }
  });

  const response = await handleFetchWithExpress(app, request);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-custom-header'), 'custom-value');
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');

  const json = await response.json();
  assert.equal(json.message, 'hello from worker');
  assert.equal(json.ip, '203.0.113.195');
});

test('handleFetchWithExpress preserves raw body for URL-encoded POST and parses body', async () => {
  const app = express();
  app.use(bodyParser.urlencoded({
    extended: false,
    verify: (req, res, buffer) => {
      req.rawFormBody = Buffer.from(buffer);
    }
  }));

  app.post('/webhook', (req, res) => {
    assert.ok(req.rawFormBody, 'rawFormBody must be populated');
    assert.equal(req.rawFormBody.toString(), 'MerchantTradeNo=TX12345&TradeAmt=300');
    res.send('1|OK');
  });

  const bodyText = 'MerchantTradeNo=TX12345&TradeAmt=300';
  const request = new Request('https://donatio.jjmowlab.com/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: bodyText
  });

  const response = await handleFetchWithExpress(app, request);
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.equal(text, '1|OK');
});

test('handleFetchWithExpress streams Server-Sent Events (SSE) correctly', async () => {
  const app = express();
  app.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders?.();
    res.write('data: {"status":"connected"}\n\n');
    res.write('event: ping\ndata: 123456\n\n');
    res.end();
  });

  const request = new Request('https://donatio.jjmowlab.com/events', {
    method: 'GET'
  });

  const response = await handleFetchWithExpress(app, request);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/event-stream');

  const text = await response.text();
  assert.ok(text.includes('data: {"status":"connected"}\n\n'));
  assert.ok(text.includes('event: ping\ndata: 123456\n\n'));
});

test('handleFetchWithExpress returns 404 for unhandled routes', async () => {
  const app = express();
  const request = new Request('https://donatio.jjmowlab.com/non-existent-route', {
    method: 'GET'
  });

  const response = await handleFetchWithExpress(app, request);
  assert.equal(response.status, 404);
});
