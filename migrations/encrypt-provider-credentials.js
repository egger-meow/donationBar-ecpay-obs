import 'dotenv/config';
import pg from 'pg';
import { encryptCredential, isEncryptedCredential } from '../lib/credentials.js';
import { databaseSsl } from '../lib/database-ssl.js';

const { Client } = pg;
if (process.env.ENVIRONMENT === 'sandbox') process.exit(0);
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required to encrypt provider credentials');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: databaseSsl()
});
try {
  await client.connect();
  await client.query('BEGIN');
  const result = await client.query('SELECT id, merchant_id, hash_key, hash_iv FROM payment_providers FOR UPDATE');
  for (const row of result.rows) {
    if ([row.merchant_id, row.hash_key, row.hash_iv].every(value => !value || isEncryptedCredential(value))) continue;
    await client.query(
      'UPDATE payment_providers SET merchant_id = $1, hash_key = $2, hash_iv = $3, updated_at = NOW() WHERE id = $4',
      [encryptCredential(row.merchant_id), encryptCredential(row.hash_key), encryptCredential(row.hash_iv), row.id]
    );
  }
  await client.query('COMMIT');
  console.log('Payment provider credentials encrypted.');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
