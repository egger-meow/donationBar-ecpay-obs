import { createDecipheriv } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { createWriteStream } from 'node:fs';
import { mkdtemp, open, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import { BACKUP_MAGIC, backupKey, childCompletion, requireDatabaseUrl } from './postgres-backup.js';

export function assertRestoreAllowed(env = process.env) {
  if (env.ALLOW_DATABASE_RESTORE !== 'yes') throw new Error('Set ALLOW_DATABASE_RESTORE=yes to confirm this destructive operation');
}

async function main() {
  const input = process.argv[2];
  if (!input) throw new Error('Usage: npm run restore -- <backup-file>');
  assertRestoreAllowed();
  const key = backupKey();
  const databaseUrl = requireDatabaseUrl();
  const file = await open(input, 'r');
  const { size } = await stat(input);
  const headerLength = BACKUP_MAGIC.length + 12;
  if (size <= headerLength + 16) throw new Error('Backup file is truncated');
  const header = Buffer.alloc(headerLength);
  await file.read(header, 0, header.length, 0);
  if (!header.subarray(0, BACKUP_MAGIC.length).equals(BACKUP_MAGIC)) throw new Error('Unsupported backup format');
  const authTag = Buffer.alloc(16);
  await file.read(authTag, 0, authTag.length, size - authTag.length);
  await file.close();
  const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(BACKUP_MAGIC.length));
  decipher.setAuthTag(authTag);
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'donationbar-restore-'));
  const dumpPath = join(temporaryDirectory, 'database.dump');
  try {
    await pipeline(
      createReadStream(input, { start: headerLength, end: size - 17 }),
      decipher,
      createWriteStream(dumpPath, { flags: 'wx', mode: 0o600 })
    );
    const restore = spawn('pg_restore', ['--clean', '--if-exists', '--no-owner', '--no-acl', '--exit-on-error', '--dbname', databaseUrl, dumpPath], {
      stdio: ['ignore', 'inherit', 'inherit'],
      windowsHide: true
    });
    await childCompletion(restore, 'pg_restore');
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
  console.log(`PostgreSQL restore completed from: ${input}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
