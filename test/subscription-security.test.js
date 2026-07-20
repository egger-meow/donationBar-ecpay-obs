import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// History: the 2026-07-12 security pass removed an inline free-pass trigger from
// the feedback route and this file asserted it stayed out. On 2026-07-20 the
// owner sanctioned the mechanic (docs/features/EASTER_EGG.md), so the invariant
// changed: the grant may exist, but only inside lib/easter-egg.js where it is
// unit-tested to be exact-match, once-per-user, and always audit-logged.

test('free-pass grants only happen through the audited easter-egg module', async () => {
  const serverSource = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  // The route must delegate — no inline secret phrase or grant logic in server.js.
  assert.doesNotMatch(serverSource, /jjmow is my daddy/);
  assert.doesNotMatch(serverSource, /subscription\.free_pass_granted/);
  assert.match(serverSource, /maybeActivateFreePass\(/);

  // No other module besides lib/easter-egg.js may write a free_pass upgrade.
  const eggSource = await readFile(new URL('../lib/easter-egg.js', import.meta.url), 'utf8');
  assert.match(eggSource, /subscription\.free_pass_granted/);
  assert.doesNotMatch(serverSource, /planType:\s*'free_pass'/);
});
