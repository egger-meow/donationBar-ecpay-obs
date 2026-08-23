import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioController } from '../public/js/overlay/audio-controller.js';

test('AudioController: initializes with default volume and mute state', () => {
  const controller = new AudioController();
  assert.equal(controller.volume, 80);
  assert.equal(controller.isMuted, false);
  assert.equal(controller.getEffectiveVolume(), 0.8);
});

test('AudioController: setVolume clamps values within 0-100', () => {
  const controller = new AudioController();
  controller.setVolume(120);
  assert.equal(controller.volume, 100);
  assert.equal(controller.getEffectiveVolume(), 1.0);

  controller.setVolume(-10);
  assert.equal(controller.volume, 0);
  assert.equal(controller.getEffectiveVolume(), 0.0);

  controller.setVolume(45);
  assert.equal(controller.volume, 45);
  assert.equal(controller.getEffectiveVolume(), 0.45);
});

test('AudioController: setMuted sets effective volume to 0', () => {
  const controller = new AudioController({ volume: 75 });
  assert.equal(controller.getEffectiveVolume(), 0.75);

  controller.setMuted(true);
  assert.equal(controller.getEffectiveVolume(), 0);

  controller.setMuted(false);
  assert.equal(controller.getEffectiveVolume(), 0.75);
});

test('AudioController: queueSound schedules audio tasks without error in headless env', async () => {
  const controller = new AudioController({ volume: 80 });
  controller.queueSound('milestone');
  controller.queueSound('completion');
  // Headless environment has no window.AudioContext; methods must degrade safely without unhandled rejections
  assert.equal(controller.isMuted, false);
});
