import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Google OAuth routes require Passport state validation', () => {
  const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(source, /passport\.authenticate\('google',\s*\{[\s\S]*?state:\s*true/);
  assert.match(source, /failureRedirect:\s*'\/login\?error=oauth_failed',\s*state:\s*true/);
});

test('OAuth callback rotates the session before establishing the authenticated session', () => {
  const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(source, /function regenerateOAuthSession\(req, res, next\)[\s\S]*?req\.session\.regenerate/);
  assert.match(source, /req\.logIn\(user,\s*\{\s*session:\s*true\s*\}/);
  assert.match(source, /passport\.authenticate\('google',[\s\S]*?\),\s*regenerateOAuthSession,\s*async \(req, res\)/);
});
