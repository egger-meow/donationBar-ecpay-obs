// Source Registry for Universal Revenue Event Core
// Defines all known revenue sources, their active status, and lightweight capability models.

export const SOURCE_DEFINITIONS = Object.freeze({
  ecpay: Object.freeze({
    id: 'ecpay',
    name: 'ECPay',
    type: 'payment_provider',
    status: 'active',
    description: 'ECPay Taiwan payment gateway donation callback',
    capabilities: Object.freeze({
      monetary: true,
      nonMonetary: false,
      subscriptions: false,
      supporterMessage: true,
      multiCurrency: false,
      webhookTransport: true,
      manualEntry: false,
      isRealtime: false
    })
  }),

  webhook: Object.freeze({
    id: 'webhook',
    name: 'Generic Webhook',
    type: 'generic_webhook',
    status: 'active',
    description: 'Authenticated HTTP webhook for custom platforms, bots, and external tools',
    capabilities: Object.freeze({
      monetary: true,
      nonMonetary: true,
      subscriptions: true,
      supporterMessage: true,
      multiCurrency: true,
      webhookTransport: true,
      manualEntry: false,
      isRealtime: false
    })
  }),

  manual: Object.freeze({
    id: 'manual',
    name: 'Manual Entry',
    type: 'internal',
    status: 'active',
    description: 'Authenticated creator manual goal adjustment',
    capabilities: Object.freeze({
      monetary: true,
      nonMonetary: true,
      subscriptions: false,
      supporterMessage: true,
      multiCurrency: true,
      webhookTransport: false,
      manualEntry: true,
      isRealtime: false
    })
  }),

  test: Object.freeze({
    id: 'test',
    name: 'Test Console',
    type: 'internal',
    status: 'active',
    description: 'Synthetic test contribution for overlay and goal verification',
    capabilities: Object.freeze({
      monetary: true,
      nonMonetary: true,
      subscriptions: true,
      supporterMessage: true,
      multiCurrency: true,
      webhookTransport: false,
      manualEntry: true,
      isRealtime: false
    })
  }),

  // Planned future sources (defined for architecture boundaries, NOT active in Stage 1)
  twitch: Object.freeze({
    id: 'twitch',
    name: 'Twitch',
    type: 'platform',
    status: 'planned',
    description: 'Twitch EventSub for Bits and Subscriptions (Stage 5)',
    capabilities: Object.freeze({
      monetary: false,
      nonMonetary: true,
      subscriptions: true,
      supporterMessage: true,
      multiCurrency: false,
      webhookTransport: true,
      manualEntry: false,
      isRealtime: true
    })
  }),

  kofi: Object.freeze({
    id: 'kofi',
    name: 'Ko-fi',
    type: 'platform',
    status: 'planned',
    description: 'Ko-fi Webhook for tips and subscriptions (Stage 5)',
    capabilities: Object.freeze({
      monetary: true,
      nonMonetary: false,
      subscriptions: true,
      supporterMessage: true,
      multiCurrency: true,
      webhookTransport: true,
      manualEntry: false,
      isRealtime: false
    })
  }),

  streamlabs: Object.freeze({
    id: 'streamlabs',
    name: 'Streamlabs',
    type: 'platform',
    status: 'planned',
    description: 'Streamlabs Socket API (Stage 5)',
    capabilities: Object.freeze({
      monetary: true,
      nonMonetary: true,
      subscriptions: true,
      supporterMessage: true,
      multiCurrency: true,
      webhookTransport: false,
      manualEntry: false,
      isRealtime: true
    })
  }),

  streamelements: Object.freeze({
    id: 'streamelements',
    name: 'StreamElements',
    type: 'platform',
    status: 'planned',
    description: 'StreamElements Socket API (Stage 5)',
    capabilities: Object.freeze({
      monetary: true,
      nonMonetary: true,
      subscriptions: true,
      supporterMessage: true,
      multiCurrency: true,
      webhookTransport: false,
      manualEntry: false,
      isRealtime: true
    })
  }),

  youtube: Object.freeze({
    id: 'youtube',
    name: 'YouTube',
    type: 'platform',
    status: 'planned',
    description: 'YouTube Live Chat / PubSub for Super Chats and Memberships (Stage 5)',
    capabilities: Object.freeze({
      monetary: true,
      nonMonetary: true,
      subscriptions: true,
      supporterMessage: true,
      multiCurrency: true,
      webhookTransport: true,
      manualEntry: false,
      isRealtime: true
    })
  })
});

/**
 * Look up source definition by identifier.
 * @param {string} sourceId
 * @returns {Object|null} Source definition or null
 */
export function getSourceDefinition(sourceId) {
  const normalized = String(sourceId || '').trim().toLowerCase();
  return SOURCE_DEFINITIONS[normalized] || null;
}

/**
 * Returns all currently active sources (ready for production use in Stage 1).
 * @returns {Array<Object>}
 */
export function getActiveSources() {
  return Object.values(SOURCE_DEFINITIONS).filter(s => s.status === 'active');
}

/**
 * Checks if a source is registered and active.
 * @param {string} sourceId
 * @returns {boolean}
 */
export function isSourceActive(sourceId) {
  const def = getSourceDefinition(sourceId);
  return def !== null && def.status === 'active';
}

/**
 * Validates if a source supports a specific capability.
 * @param {string} sourceId
 * @param {string} capabilityKey
 * @returns {boolean}
 */
export function validateSourceCapability(sourceId, capabilityKey) {
  const def = getSourceDefinition(sourceId);
  if (!def || !def.capabilities) return false;
  return Boolean(def.capabilities[capabilityKey]);
}
