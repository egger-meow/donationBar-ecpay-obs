import test from 'node:test';
import assert from 'node:assert/strict';
import { OverlayRenderer } from '../public/js/overlay/overlay-renderer.js';

class MockElement {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.className = '';
    this.textContent = '';
    this.style = {};
    this.children = [];
    this.classList = {
      add: (c) => { if (!this.className.includes(c)) this.className += ` ${c}`; },
      remove: (c) => { this.className = this.className.replace(c, '').trim(); },
      contains: (c) => this.className.includes(c)
    };
  }
  appendChild(child) {
    this.children.push(child);
    return child;
  }
}

test('OverlayRenderer: presentMilestone skips visual animations when visualAction is false', async () => {
  const origDoc = global.document;
  global.document = {
    createElement: (tag) => new MockElement(tag)
  };

  try {
    const root = new MockElement('main');
    const renderer = new OverlayRenderer(root);

    // Call presentMilestone with visualAction: false
    await renderer.presentMilestone({
      thresholdPercent: 50,
      label: '50% 里程碑',
      visualAction: false
    }, 50);

    // Banner must NOT have 'active' class
    assert.equal(renderer.elements.milestoneBanner.classList.contains('active'), false);
    assert.equal(renderer.elements.fill.classList.contains('shimmer-active'), false);
    assert.equal(renderer.elements.card.classList.contains('pulse-active'), false);
  } finally {
    global.document = origDoc;
  }
});

test('OverlayRenderer: presentMilestone executes visual animations when visualAction is true', async () => {
  const origDoc = global.document;
  global.document = {
    createElement: (tag) => new MockElement(tag)
  };

  try {
    const root = new MockElement('main');
    const renderer = new OverlayRenderer(root);

    // Start presentMilestone with visualAction: true
    const promise = renderer.presentMilestone({
      thresholdPercent: 50,
      label: '50% 里程碑',
      visualAction: true
    }, 40);

    // While animating, banner must have 'active' class
    assert.equal(renderer.elements.milestoneBanner.classList.contains('active'), true);
    assert.equal(renderer.elements.fill.classList.contains('shimmer-active'), true);
    assert.equal(renderer.elements.card.classList.contains('pulse-active'), true);

    await promise;

    // After animation finishes, active classes are cleaned up
    assert.equal(renderer.elements.milestoneBanner.classList.contains('active'), false);
  } finally {
    global.document = origDoc;
  }
});

test('OverlayRenderer: presentCompletion skips visual animations when visualAction is false', async () => {
  const origDoc = global.document;
  global.document = {
    createElement: (tag) => new MockElement(tag)
  };

  try {
    const root = new MockElement('main');
    const renderer = new OverlayRenderer(root);

    await renderer.presentCompletion({
      title: '目標達成',
      visualAction: false
    }, 50);

    assert.equal(renderer.elements.milestoneBanner.classList.contains('active'), false);
    assert.equal(renderer.elements.card.classList.contains('goal-completed-card'), false);
  } finally {
    global.document = origDoc;
  }
});
