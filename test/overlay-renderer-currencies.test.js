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
      remove: (c) => { this.className = this.className.replace(c, '').trim(); }
    };
  }
  appendChild(child) {
    this.children.push(child);
    return child;
  }
}

test('OverlayRenderer: correctly renders canonical minor units across TWD, USD, and JPY', () => {
  const origDoc = global.document;
  global.document = {
    createElement: (tag) => new MockElement(tag)
  };

  try {
    const root = new MockElement('main');
    const renderer = new OverlayRenderer(root);

    // 1. TWD 300 (30,000 minor)
    renderer.renderProgress({
      title: 'TWD 目標',
      currency: 'TWD',
      currentAmountMinor: 30000,
      targetAmountMinor: 100000,
      percent: 30,
      latestDonation: {
        payer: '小明',
        amountMinor: 30000,
        currency: 'TWD',
        message: '加油！'
      }
    });

    assert.equal(renderer.elements.currentSpan.textContent, 'NT$ 300');
    assert.equal(renderer.elements.targetSpan.textContent, 'NT$ 1,000');
    assert.equal(renderer.elements.percentage.textContent, '30%');
    assert.equal(renderer.elements.supporterAmount.textContent, ' (NT$ 300)');

    // 2. USD 10.50 (1,050 minor)
    renderer.renderProgress({
      title: 'USD Goal',
      currency: 'USD',
      currentAmountMinor: 1050,
      targetAmountMinor: 10000,
      percent: 10,
      latestDonation: {
        payer: 'Alice',
        amountMinor: 1050,
        currency: 'USD'
      }
    });

    assert.equal(renderer.elements.currentSpan.textContent, 'US$ 10.50');
    assert.equal(renderer.elements.targetSpan.textContent, 'US$ 100');
    assert.equal(renderer.elements.supporterAmount.textContent, ' (US$ 10.50)');

    // 3. JPY 300 (300 minor, 0 decimals) - MUST NOT RENDER ¥30,000
    renderer.renderProgress({
      title: 'JPY Goal',
      currency: 'JPY',
      currentAmountMinor: 300,
      targetAmountMinor: 1000,
      percent: 30,
      latestDonation: {
        payer: '田中',
        amountMinor: 300,
        currency: 'JPY'
      }
    });

    assert.equal(renderer.elements.currentSpan.textContent, '¥ 300');
    assert.equal(renderer.elements.targetSpan.textContent, '¥ 1,000');
    assert.notEqual(renderer.elements.currentSpan.textContent, '¥ 30,000');
    assert.equal(renderer.elements.supporterAmount.textContent, ' (¥ 300)');
  } finally {
    global.document = origDoc;
  }
});

test('OverlayRenderer: legacy major-unit fallback correctly handles JPY and USD exponents', () => {
  const origDoc = global.document;
  global.document = {
    createElement: (tag) => new MockElement(tag)
  };

  try {
    const root = new MockElement('main');
    const renderer = new OverlayRenderer(root);

    // Legacy JPY payload with major units (current: 300, goal: 1000)
    renderer.renderProgress({
      title: 'JPY Legacy Goal',
      currency: 'JPY',
      current: 300,
      goal: 1000,
      percent: 30,
      latestDonation: {
        payer: '佐藤',
        amount: 300,
        currency: 'JPY'
      }
    });

    assert.equal(renderer.elements.currentSpan.textContent, '¥ 300');
    assert.equal(renderer.elements.targetSpan.textContent, '¥ 1,000');
    assert.equal(renderer.elements.supporterAmount.textContent, ' (¥ 300)');
  } finally {
    global.document = origDoc;
  }
});
