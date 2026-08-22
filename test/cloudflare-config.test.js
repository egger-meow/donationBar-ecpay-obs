import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  BRAND_NAME_EN,
  BRAND_NAME_ZH,
  BRAND_TAGLINE_EN,
  BRAND_TAGLINE_ZH,
  CANONICAL_PRODUCTION_DOMAIN,
  CANONICAL_PRODUCTION_URL
} from '../lib/config.js';
import worker from '../src/worker.js';

test('wrangler.toml is valid and contains required Cloudflare Workers configurations', () => {
  const config = fs.readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
  
  // Core runtime settings
  assert.match(config, /name\s*=\s*"donatio"/);
  assert.match(config, /main\s*=\s*"src\/worker\.js"/);
  assert.match(config, /compatibility_flags\s*=\s*\["nodejs_compat"\]/);
  assert.match(config, /compatibility_date\s*=\s*"2026-08-22"/);
  
  // Static assets binding
  assert.match(config, /\[assets\]/);
  assert.match(config, /directory\s*=\s*"\.\/public"/);
  
  // Explicit per-environment Hyperdrive bindings (non-inheritable)
  assert.match(config, /\[\[hyperdrive\]\]/);
  assert.match(config, /\[\[env\.staging\.hyperdrive\]\]/);
  assert.match(config, /\[\[env\.production\.hyperdrive\]\]/);
  
  // Staging and production custom domains
  assert.match(config, /pattern\s*=\s*"donatio-staging\.jjmowlab\.com"/);
  assert.match(config, /pattern\s*=\s*"donatio\.jjmowlab\.com"/);
  assert.doesNotMatch(config, /donatio\.jjmowlab\.com\/\*/, 'Custom domain must not include wildcard path');

  // Staging URLs
  assert.match(config, /BASE_URL\s*=\s*"https:\/\/donatio-staging\.jjmowlab\.com"/);
  assert.match(config, /GOOGLE_CALLBACK_URL\s*=\s*"https:\/\/donatio-staging\.jjmowlab\.com\/api\/auth\/google\/callback"/);
});

test('canonical brand and domain constants are correctly exported in config', () => {
  assert.equal(BRAND_NAME_EN, 'Donatio');
  assert.equal(BRAND_NAME_ZH, '斗內條');
  assert.equal(BRAND_TAGLINE_EN, 'One goal. Every support source.');
  assert.equal(BRAND_TAGLINE_ZH, '所有斗內，一條搞定。');
  assert.equal(CANONICAL_PRODUCTION_DOMAIN, 'donatio.jjmowlab.com');
  assert.equal(CANONICAL_PRODUCTION_URL, 'https://donatio.jjmowlab.com');
});

test('src/worker.js exports standard Cloudflare Worker fetch handler', () => {
  assert.ok(worker && typeof worker.fetch === 'function', 'Worker must export a default object with a fetch function');
});
