import crypto from 'crypto';

const PREFIX = 'enc:v1:';

export function getCredentialEncryptionKey(env = process.env) {
  const value = String(env.CREDENTIAL_ENCRYPTION_KEY || '').trim();
  if (!value) return null;
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32) throw new Error('CREDENTIAL_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
  return key;
}

export function isEncryptedCredential(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

export function encryptCredential(value, env = process.env) {
  if (value === null || value === undefined || value === '') return value || '';
  const key = getCredentialEncryptionKey(env);
  if (!key) throw new Error('CREDENTIAL_ENCRYPTION_KEY is required to encrypt payment credentials');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return `${PREFIX}${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${ciphertext.toString('base64')}`;
}

export function decryptCredential(value, env = process.env) {
  if (value === null || value === undefined || value === '') return value || '';
  if (!isEncryptedCredential(value)) throw new Error('Unencrypted payment credentials detected; run npm migrate before starting production');
  const key = getCredentialEncryptionKey(env);
  if (!key) throw new Error('CREDENTIAL_ENCRYPTION_KEY is required to decrypt payment credentials');
  const [, , ivText, tagText, ciphertextText] = value.split(':');
  if (!ivText || !tagText || !ciphertextText) throw new Error('Invalid encrypted payment credential');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivText, 'base64'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextText, 'base64')), decipher.final()]).toString('utf8');
}
