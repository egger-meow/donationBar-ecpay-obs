import test from 'node:test';
import assert from 'node:assert/strict';
import { databaseSsl } from '../lib/database-ssl.js';

test('production database connections verify TLS certificates', () => {
  assert.deepEqual(databaseSsl({ NODE_ENV: 'production' }), { rejectUnauthorized: true, ca: undefined });
});

test('sslmode=require is honored outside production', () => {
  assert.equal(databaseSsl({ NODE_ENV: 'development', DATABASE_URL: 'postgres://db/app?sslmode=require' }).rejectUnauthorized, true);
});

test('local development keeps the local database connection simple', () => {
  assert.equal(databaseSsl({ NODE_ENV: 'development', DATABASE_URL: 'postgres://db/app' }), false);
});
