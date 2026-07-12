import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('workspace webhook verifies the outer CheckMacValue before decrypting Data', async () => {
  const source = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  const start = source.indexOf("app.post('/webhook/:slug'");
  const decrypt = source.indexOf('// Decrypt the Data field', start);
  assert.ok(start >= 0 && decrypt > start, 'expected active workspace webhook and decryption branch');
  const beforeDecrypt = source.slice(start, decrypt);
  assert.match(beforeDecrypt, /await verifyCheckMacValue\(payload, workspace\.id, req\.rawFormBody\)/);
  assert.match(beforeDecrypt, /payment_webhook_invalid_signature/);
});
