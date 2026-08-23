import test from 'node:test';
import assert from 'node:assert/strict';
import { OverlayRenderer } from '../public/js/overlay/overlay-renderer.js';

// Minimal mock DOM node for Node.js test environment
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

test('OverlayRenderer: safe rendering of malicious HTML & script injection', () => {
  // Mock global document
  const origDoc = global.document;
  global.document = {
    createElement: (tag) => new MockElement(tag)
  };

  try {
    const root = new MockElement('main');
    const renderer = new OverlayRenderer(root);

    // Malicious XSS payload in goal title, supporter, message
    const maliciousPayload = {
      title: '<script>alert("xss")</script><img src=x onerror=alert(1)>',
      currentAmountMinor: 50000,
      targetAmountMinor: 100000,
      currency: 'TWD',
      latestDonation: {
        payer: '<b>Malicious Donor</b>',
        amountMinor: 50000,
        message: '<iframe src="javascript:alert(1)"></iframe>'
      }
    };

    renderer.renderProgress(maliciousPayload);

    // Title must be plain text
    assert.equal(renderer.elements.title.textContent, '<script>alert("xss")</script><img src=x onerror=alert(1)>');
    // Supporter name must be plain text
    assert.equal(renderer.elements.supporterName.textContent, '<b>Malicious Donor</b>');
    // Message must be plain text
    assert.equal(renderer.elements.supporterMessage.textContent, '：<iframe src="javascript:alert(1)"></iframe>');
  } finally {
    global.document = origDoc;
  }
});
