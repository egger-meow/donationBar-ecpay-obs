import test from 'node:test';
import assert from 'node:assert/strict';
import { BACKUP_MAGIC, backupHeader, backupKey, requireDatabaseUrl } from '../operations/postgres-backup.js';
import { assertRestoreAllowed } from '../operations/postgres-restore.js';

test('backup key requires exactly 32 base64-decoded bytes', () => {
  const valid = Buffer.alloc(32, 7);
  assert.deepEqual(backupKey({ BACKUP_ENCRYPTION_KEY: valid.toString('base64') }), valid);
  assert.throws(() => backupKey({ BACKUP_ENCRYPTION_KEY: 'short' }), /32-byte key/);
});

test('backup header identifies format and carries the IV', () => {
  const iv = Buffer.alloc(12, 3);
  assert.deepEqual(backupHeader(iv), Buffer.concat([BACKUP_MAGIC, iv]));
  assert.throws(() => backupHeader(Buffer.alloc(11)), /12 bytes/);
});

test('database URL and destructive restore confirmation are mandatory', () => {
  assert.throws(() => requireDatabaseUrl({}), /DATABASE_URL/);
  assert.throws(() => assertRestoreAllowed({}), /ALLOW_DATABASE_RESTORE=yes/);
  assert.doesNotThrow(() => assertRestoreAllowed({ ALLOW_DATABASE_RESTORE: 'yes' }));
});
