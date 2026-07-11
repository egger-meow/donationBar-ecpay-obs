import { createCipheriv, randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BACKUP_MAGIC = Buffer.from('DONATIONBAR_BACKUP_V1\n');

export function backupKey(env = process.env) {
  const value = env.BACKUP_ENCRYPTION_KEY;
  const key = value ? Buffer.from(value, 'base64') : Buffer.alloc(0);
  if (key.length !== 32) throw new Error('BACKUP_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
  return key;
}

export function requireDatabaseUrl(env = process.env) {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  return env.DATABASE_URL;
}

export function backupHeader(iv) {
  if (!Buffer.isBuffer(iv) || iv.length !== 12) throw new Error('Backup IV must be 12 bytes');
  return Buffer.concat([BACKUP_MAGIC, iv]);
}

export function childCompletion(child, command) {
  return new Promise((resolve, reject) => {
    child.once('error', error => reject(new Error(`Unable to start ${command}: ${error.message}`)));
    child.once('close', code => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`)));
  });
}

async function main() {
  const output = process.argv[2];
  if (!output) throw new Error('Usage: npm run backup -- <output-file>');
  const key = backupKey();
  const databaseUrl = requireDatabaseUrl();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  let created = false;
  try {
    const destination = createWriteStream(output, { flags: 'wx', mode: 0o600 });
    await new Promise((resolve, reject) => destination.once('open', resolve).once('error', reject));
    created = true;
    destination.write(backupHeader(iv));
    const dump = spawn('pg_dump', ['--format=custom', '--no-owner', '--no-acl', '--dbname', databaseUrl], {
      stdio: ['ignore', 'pipe', 'inherit'],
      windowsHide: true
    });
    const completed = childCompletion(dump, 'pg_dump');
    await pipeline(dump.stdout, cipher, destination, { end: false });
    await completed;
    destination.end(cipher.getAuthTag());
    await new Promise((resolve, reject) => destination.once('close', resolve).once('error', reject));
  } catch (error) {
    if (created) await rm(output, { force: true });
    throw error;
  }
  console.log(`Encrypted PostgreSQL backup created: ${output}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
