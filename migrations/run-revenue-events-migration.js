import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { databaseSsl } from '../lib/database-ssl.js';

const { Client } = pg;
const databaseUrl = process.env.DATABASE_URL;

if (process.env.ENVIRONMENT === 'sandbox') {
  console.log('Revenue events migration is not needed for JSON sandbox storage.');
  process.exit(0);
}
if (!databaseUrl) throw new Error('DATABASE_URL is required to run PostgreSQL migrations');

const client = new Client({
  connectionString: databaseUrl,
  ssl: databaseSsl()
});
try {
  await client.connect();
  const sql = fs.readFileSync(path.join(path.resolve(), 'migrations', '20260822-create-revenue-events.sql'), 'utf8');
  await client.query(sql);
  console.log('Revenue events migration applied successfully.');
} finally {
  await client.end();
}
