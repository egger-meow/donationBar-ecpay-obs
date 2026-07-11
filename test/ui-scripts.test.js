import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const pages = ['admin.html', 'donate.html', 'login.html', 'overlay.html', 'privacy.html', 'terms.html'];

test('browser page inline scripts parse', () => {
  for (const page of pages) {
    const source = fs.readFileSync(path.join(process.cwd(), 'public', page), 'utf8');
    const scripts = [...source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
    for (const script of scripts) assert.doesNotThrow(() => new Function(script[1]), `${page} contains invalid JavaScript`);
  }
});
