import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptCredential } from '../lib/credentials.js';
import { decryptProviderCredentials, isMerchantIdSharedAcrossWorkspaces } from '../lib/payment-provider-credentials.js';

const env = { CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64') };

test('decryptProviderCredentials reverses upsertPaymentProvider\'s encryption for all three fields', () => {
  const row = {
    id: 'p1',
    workspaceId: 'w1',
    providerName: 'ecpay',
    merchantId: encryptCredential('2000132', env),
    hashKey: encryptCredential('5294y06JbISpM5x9', env),
    hashIV: encryptCredential('v77hoKGq4kWxNNIS', env)
  };
  const decrypted = decryptProviderCredentials(row, env);
  assert.equal(decrypted.merchantId, '2000132');
  assert.equal(decrypted.hashKey, '5294y06JbISpM5x9');
  assert.equal(decrypted.hashIV, 'v77hoKGq4kWxNNIS');
  // Non-credential fields pass through untouched.
  assert.equal(decrypted.id, 'p1');
  assert.equal(decrypted.workspaceId, 'w1');
});

test('decryptProviderCredentials leaves empty/missing fields as empty strings, and null row as null', () => {
  assert.equal(decryptProviderCredentials(null), null);
  const decrypted = decryptProviderCredentials({ merchantId: '', hashKey: null, hashIV: undefined }, env);
  assert.equal(decrypted.merchantId, '');
  assert.equal(decrypted.hashKey, '');
  assert.equal(decrypted.hashIV, '');
});

test('decryptProviderCredentials throws on ciphertext that fails authentication (never silently returns garbage to sign)', () => {
  const parts = encryptCredential('2000132', env).split(':');
  parts[4] = `${parts[4].startsWith('A') ? 'B' : 'A'}${parts[4].slice(1)}`;
  const tampered = parts.join(':');
  assert.throws(() => decryptProviderCredentials({ merchantId: tampered, hashKey: '', hashIV: '' }, env));
});

test('isMerchantIdSharedAcrossWorkspaces detects an exact match on another workspace', () => {
  const others = [
    { workspaceId: 'w2', merchantId: '2000132' },
    { workspaceId: 'w3', merchantId: '3000999' }
  ];
  assert.equal(isMerchantIdSharedAcrossWorkspaces(others, '2000132'), true);
  assert.equal(isMerchantIdSharedAcrossWorkspaces(others, ' 2000132 '), true, 'trims whitespace');
  assert.equal(isMerchantIdSharedAcrossWorkspaces(others, '9999999'), false);
});

test('isMerchantIdSharedAcrossWorkspaces treats an empty target or empty list as not shared', () => {
  assert.equal(isMerchantIdSharedAcrossWorkspaces([], '2000132'), false);
  assert.equal(isMerchantIdSharedAcrossWorkspaces([{ workspaceId: 'w2', merchantId: '2000132' }], ''), false);
  assert.equal(isMerchantIdSharedAcrossWorkspaces([{ workspaceId: 'w2', merchantId: '2000132' }], null), false);
});
