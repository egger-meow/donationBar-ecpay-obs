import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { databaseSsl } from '../database-ssl.js';

const { Client } = pg;
const databaseUrl = process.env.DATABASE_URL;

if (process.env.ENVIRONMENT === 'sandbox') {
  console.log('Activation tracking migration is not needed for JSON sandbox storage.');
  process.exit(0);
}
if (!databaseUrl) throw new Error('DATABASE_URL is required to run PostgreSQL migrations');

const client = new Client({
  connectionString: databaseUrl,
  ssl: databaseSsl()
});
try {
  await client.connect();
  const sql = fs.readFileSync(path.join(path.resolve(), 'migrations', '20260711-add-activation-tracking.sql'), 'utf8');
  await client.query(sql);
  console.log('Activation tracking migration applied.');
} finally {
  await client.end();
}
