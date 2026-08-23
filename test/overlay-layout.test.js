import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('overlay layout has transparent background and responsive viewport bounds', async () => {
  const htmlSource = await readFile(new URL('../public/overlay.html', import.meta.url), 'utf8');
  assert.match(htmlSource, /<main id="overlayApp"/);
  assert.match(htmlSource, /href="\/css\/overlay-base\.css"/);

  const cssSource = await readFile(new URL('../public/css/overlay-base.css', import.meta.url), 'utf8');
  assert.match(cssSource, /background:\s*transparent\s*!important/);
  assert.match(cssSource, /overflow:\s*hidden/);
  assert.match(cssSource, /@media\s*\(max-height:\s*250px\)/);
  assert.match(cssSource, /@media\s*\(max-width:\s*600px\)/);
});
