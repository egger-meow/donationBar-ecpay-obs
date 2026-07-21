import { decryptCredential } from './credentials.js';

// Kept out of database.js so these can be unit tested without importing the
// module and instantiating the live Database() singleton (which can attempt
// a real Postgres connection as an import-time side effect when DATABASE_URL
// is set).

/**
 * Decrypts the three ECPay credential fields on a payment_providers row.
 * Postgres always stores them as enc:v1: ciphertext (upsertPaymentProvider
 * encrypts on every write); this is a no-op for empty/missing values.
 */
export function decryptProviderCredentials(row, env = process.env) {
  if (!row) return row;
  return {
    ...row,
    merchantId: decryptCredential(row.merchantId, env),
    hashKey: decryptCredential(row.hashKey, env),
    hashIV: decryptCredential(row.hashIV, env)
  };
}

/**
 * Pure comparison used by isEcpayMerchantIdSharedWithOtherWorkspace: does any
 * row in `otherProviderRows` (already-decrypted {workspaceId, merchantId}
 * pairs, excluding the workspace being checked) use the same MerchantID?
 */
export function isMerchantIdSharedAcrossWorkspaces(otherProviderRows, targetMerchantId) {
  const normalizedTarget = String(targetMerchantId || '').trim();
  if (!normalizedTarget) return false;
  return otherProviderRows.some(row => String(row.merchantId || '').trim() === normalizedTarget);
}
