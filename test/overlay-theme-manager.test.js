import test from 'node:test';
import assert from 'node:assert/strict';
import { ThemeManager, THEMES, THEME_DEFAULTS } from '../public/js/overlay/theme-manager.js';

test('ThemeManager: defaults to minimal theme and validates inputs', () => {
  const manager = new ThemeManager();
  assert.equal(manager.getTheme(), THEMES.MINIMAL);

  manager.setTheme('gaming');
  assert.equal(manager.getTheme(), THEMES.GAMING);

  manager.setTheme('neon');
  assert.equal(manager.getTheme(), THEMES.GAMING);

  manager.setTheme('creator');
  assert.equal(manager.getTheme(), THEMES.CREATOR);

  manager.setTheme('unknown-invalid');
  assert.equal(manager.getTheme(), THEMES.MINIMAL);
});

test('ThemeManager: getThemeConfig returns theme default values', () => {
  const manager = new ThemeManager('gaming');
  const config = manager.getThemeConfig();
  assert.equal(config.name, 'gaming');
  assert.equal(config.bar, '#06b6d4');
  assert.equal(config.accent, '#f43f5e');
});

test('ThemeManager: setColorOverrides overrides specific color properties', () => {
  const manager = new ThemeManager('minimal');
  manager.setColorOverrides({
    bar: '#3b82f6',
    fg: '#f8fafc'
  });

  const config = manager.getThemeConfig();
  assert.equal(config.bar, '#3b82f6');
  assert.equal(config.fg, '#f8fafc');
  // Non-overridden property preserves theme default
  assert.equal(config.borderRadius, '16px');
});

test('ThemeManager: parseUrlParams extracts theme and hex color overrides', () => {
  const manager = new ThemeManager();
  manager.parseUrlParams('?theme=creator&bar=ec4899&fg=ffffff');

  assert.equal(manager.getTheme(), THEMES.CREATOR);
  const config = manager.getThemeConfig();
  assert.equal(config.bar, '#ec4899');
  assert.equal(config.fg, '#ffffff');
});
