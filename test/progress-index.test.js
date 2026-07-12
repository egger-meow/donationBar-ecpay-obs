import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('progress index lists every progress section exactly once', async () => {
  const source = await readFile(new URL('../docs/PROGRESS.md', import.meta.url), 'utf8');
  const headings = [...source.matchAll(/^## (.+)$/gm)].map(match => match[1]);
  const indexStart = source.indexOf('## Progress index (section names)');
  const indexEnd = source.indexOf('\n\nThis is the single running record', indexStart);
  assert.ok(indexStart >= 0 && indexEnd > indexStart, 'progress index boundaries must remain explicit');
  const index = source.slice(indexStart, indexEnd);
  const listed = [...index.matchAll(/^- (.+)$/gm)].map(match => match[1]);
  const normalize = value => value.replaceAll('—', '-').replace(', not a live entry', '');
  assert.deepEqual(
    listed.map(normalize),
    headings.filter(heading => heading !== 'Progress index (section names)').map(normalize)
  );
});
