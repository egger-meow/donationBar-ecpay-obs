import test from 'node:test';
import assert from 'node:assert/strict';
import { decryptCredential, encryptCredential, isEncryptedCredential } from '../credentials.js';

const env = { CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') };

test('encrypts and decrypts provider credentials with authenticated encryption', () => {
  const encrypted = encryptCredential('sandbox-hash-key', env);
  assert.equal(isEncryptedCredential(encrypted), true);
  assert.notEqual(encrypted, 'sandbox-hash-key');
  assert.equal(decryptCredential(encrypted, env), 'sandbox-hash-key');
});

test('rejects tampered encrypted provider credentials', () => {
  const encrypted = encryptCredential('sandbox-hash-key', env);
  const parts = encrypted.split(':');
  parts[4] = `${parts[4].startsWith('A') ? 'B' : 'A'}${parts[4].slice(1)}`;
  assert.throws(() => decryptCredential(parts.join(':'), env));
});
