import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_MEDIA_BYTES, validateAudioDataUrl, validateImageDataUrl } from '../lib/media-upload.js';

const PNG_DATA_URL = `data:image/png;base64,${Buffer.from('fake-png-bytes').toString('base64')}`;
const MP3_DATA_URL = `data:audio/mpeg;base64,${Buffer.from('fake-mp3-bytes').toString('base64')}`;

test('validateImageDataUrl accepts a well-formed image data URL unchanged', () => {
  assert.equal(validateImageDataUrl(PNG_DATA_URL), PNG_DATA_URL);
});

test('validateImageDataUrl treats empty/null/undefined as "reset to default" (returns null, does not throw)', () => {
  assert.equal(validateImageDataUrl(null), null);
  assert.equal(validateImageDataUrl(undefined), null);
  assert.equal(validateImageDataUrl(''), null);
});

test('validateImageDataUrl rejects non-data-URL strings and disallowed mime types', () => {
  assert.throws(() => validateImageDataUrl('not-a-data-url'));
  assert.throws(() => validateImageDataUrl('data:text/plain;base64,aGVsbG8='));
  assert.throws(() => validateImageDataUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='));
  assert.throws(() => validateImageDataUrl(42));
});

test('validateImageDataUrl rejects a payload larger than the configured limit', () => {
  const oversized = `data:image/png;base64,${Buffer.alloc(20).toString('base64')}`;
  assert.throws(() => validateImageDataUrl(oversized, { maxBytes: 10 }), /too_large/);
  const justUnder = `data:image/png;base64,${Buffer.alloc(9).toString('base64')}`;
  assert.equal(validateImageDataUrl(justUnder, { maxBytes: 10 }), justUnder);
});

test('validateImageDataUrl defaults to a 5MB limit', () => {
  assert.equal(MAX_MEDIA_BYTES, 5 * 1024 * 1024);
});

test('validateAudioDataUrl accepts a well-formed audio data URL unchanged', () => {
  assert.equal(validateAudioDataUrl(MP3_DATA_URL), MP3_DATA_URL);
});

test('validateAudioDataUrl treats empty/null as reset, and rejects non-audio mime types', () => {
  assert.equal(validateAudioDataUrl(null), null);
  assert.equal(validateAudioDataUrl(''), null);
  assert.throws(() => validateAudioDataUrl('data:image/png;base64,aGVsbG8='));
  assert.throws(() => validateAudioDataUrl('data:video/mp4;base64,aGVsbG8='));
});

test('validateAudioDataUrl rejects a payload larger than the configured limit', () => {
  const oversized = `data:audio/mpeg;base64,${Buffer.alloc(20).toString('base64')}`;
  assert.throws(() => validateAudioDataUrl(oversized, { maxBytes: 10 }), /too_large/);
});
