import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Google OAuth routes require Passport state validation', () => {
  const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(source, /passport\.authenticate\('google',\s*\{[\s\S]*?state:\s*true/);
  assert.match(source, /failureRedirect:\s*'\/login\?error=oauth_failed',\s*state:\s*true/);
});
