import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getActiveSources,
  getSourceDefinition,
  isSourceActive,
  SOURCE_DEFINITIONS,
  validateSourceCapability
} from '../lib/source-registry.js';

test('source registry exposes all Stage 1 active sources', () => {
  const active = getActiveSources();
  const activeIds = active.map(s => s.id);
  assert.ok(activeIds.includes('ecpay'));
  assert.ok(activeIds.includes('webhook'));
  assert.ok(activeIds.includes('manual'));
  assert.ok(activeIds.includes('test'));
  assert.equal(active.length, 4);
});

test('planned future sources exist internally but are never active', () => {
  const plannedSources = ['twitch', 'kofi', 'streamlabs', 'streamelements', 'youtube'];
  for (const id of plannedSources) {
    const def = getSourceDefinition(id);
    assert.ok(def, `Expected ${id} to be defined in registry`);
    assert.equal(def.status, 'planned', `Expected ${id} to have status 'planned'`);
    assert.equal(isSourceActive(id), false, `Expected ${id} to not be active`);
  }
});

test('validateSourceCapability correctly reflects source capabilities', () => {
  assert.equal(validateSourceCapability('ecpay', 'monetary'), true);
  assert.equal(validateSourceCapability('ecpay', 'nonMonetary'), false);
  assert.equal(validateSourceCapability('ecpay', 'webhookTransport'), true);

  assert.equal(validateSourceCapability('webhook', 'monetary'), true);
  assert.equal(validateSourceCapability('webhook', 'nonMonetary'), true);
  assert.equal(validateSourceCapability('webhook', 'multiCurrency'), true);

  assert.equal(validateSourceCapability('manual', 'manualEntry'), true);
  assert.equal(validateSourceCapability('manual', 'webhookTransport'), false);

  assert.equal(validateSourceCapability('nonexistent', 'monetary'), false);
});
