import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('protected static pages normalize trailing slashes before denying direct access', () => {
  const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(source, /normalizedPath = req\.path\.replace/);
  assert.match(source, /protectedStaticPages\.has\(normalizedPath\)/);
});
