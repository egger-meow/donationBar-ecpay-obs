import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('database logging never interpolates donation, fingerprint, certificate, or raw error values', async () => {
  const source = await readFile(new URL('../lib/database.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /console\.(?:log|warn|error)\([^\n]*(?:donationData|fingerprint|caCert|error\.message)/);
  assert.doesNotMatch(source, /log(?:Info|Warn|Error)\([^\n]*(?:donationData|fingerprint|caCert|error\.message)/);
  assert.doesNotMatch(source, /caCert\.slice/);
});

test('email delivery failure logging does not serialize the provider error', async () => {
  const source = await readFile(new URL('../lib/email.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /console\.error\([^\n]*error(?:\.message)?/);
});
