// Validates user-uploaded images/audio that get stored as data: URLs inside a
// workspace's overlaySettings JSONB blob (donation page banner, alert image, alert
// sound). Kept dependency-light and database-free so it can be unit tested directly.

export const MAX_MEDIA_BYTES = 5 * 1024 * 1024; // 5MB, matches the admin-facing copy

const IMAGE_DATA_URL = /^data:image\/(jpeg|jpg|png|gif);base64,([A-Za-z0-9+/]+={0,2})$/;
const AUDIO_DATA_URL = /^data:audio\/(mpeg|mp3|wav|ogg|webm);base64,([A-Za-z0-9+/]+={0,2})$/;

function base64ByteLength(base64) {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return (base64.length * 3) / 4 - padding;
}

function validateDataUrl(dataUrl, pattern, kindLabel, maxBytes) {
  if (typeof dataUrl !== 'string') {
    throw new Error(`invalid_${kindLabel}_data`);
  }
  const match = pattern.exec(dataUrl);
  if (!match) {
    throw new Error(`unsupported_${kindLabel}_format`);
  }
  if (base64ByteLength(match[2]) > maxBytes) {
    throw new Error(`${kindLabel}_too_large`);
  }
  return dataUrl;
}

// Returns the validated data URL, or null when dataUrl is empty/nullish (used as the
// "reset to default" signal by the upload endpoints).
export function validateImageDataUrl(dataUrl, { maxBytes = MAX_MEDIA_BYTES } = {}) {
  if (!dataUrl) return null;
  return validateDataUrl(dataUrl, IMAGE_DATA_URL, 'image', maxBytes);
}

export function validateAudioDataUrl(dataUrl, { maxBytes = MAX_MEDIA_BYTES } = {}) {
  if (!dataUrl) return null;
  return validateDataUrl(dataUrl, AUDIO_DATA_URL, 'audio', maxBytes);
}
