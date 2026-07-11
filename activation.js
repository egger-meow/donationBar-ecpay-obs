// Pure computation for the guided-activation checklist (ROADMAP.md P1 "Guided
// activation"). Takes already-fetched workspace state and returns the checklist shape
// served by GET /admin/activation and rendered by public/admin.html.
//
// "liveAlertDelivered" is a heuristic, not a confirmed visual observation: it is true
// only when the overlay was known to have connected before the first donation. The
// existing SSE broadcast path delivers that donation update to an already-connected
// overlay (see broadcastProgress in server.js), but cannot prove it was seen on screen.
function validTimestamp(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null;
}

function elapsedMilliseconds(start, end) {
  const startMs = Date.parse(start || '');
  const endMs = Date.parse(end || '');
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) return null;
  return endMs - startMs;
}

export function computeActivationSteps({ provider, settings }) {
  const ecpayConfigured = Boolean(provider && provider.merchantId && provider.hashKey && provider.hashIV);
  const providerConfiguredAt = validTimestamp(settings?.providerConfiguredAt);
  const obsConnectedAt = validTimestamp(settings?.obsConnectedAt);
  const firstDonationAt = validTimestamp(settings?.firstDonationAt);
  const obsConnected = Boolean(obsConnectedAt);
  const firstDonation = Boolean(firstDonationAt);
  const liveAlertDeliveredAt = obsConnected && firstDonation && Date.parse(obsConnectedAt) <= Date.parse(firstDonationAt)
    ? firstDonationAt
    : null;

  return {
    ecpayConfigured: { done: ecpayConfigured, at: providerConfiguredAt },
    obsConnected: { done: obsConnected, at: obsConnectedAt },
    firstDonation: { done: firstDonation, at: firstDonationAt },
    liveAlertDelivered: { done: Boolean(liveAlertDeliveredAt), at: liveAlertDeliveredAt }
  };
}

// This intentionally operates on timestamp-only records. It is used by the
// platform-admin funnel endpoint, which returns aggregate counts and durations without
// exposing workspace, creator, donor, or payment information.
export function computeActivationFunnel(records) {
  const milestones = ['workspaceCreatedAt', 'providerConfiguredAt', 'obsConnectedAt', 'firstDonationAt', 'liveAlertDeliveredAt'];
  const totals = Object.fromEntries(milestones.map(name => [name, { completed: 0, medianMillisecondsFromOAuth: null }]));
  const elapsed = Object.fromEntries(milestones.map(name => [name, []]));

  for (const record of records) {
    const oauthCompletedAt = validTimestamp(record.oauthCompletedAt);
    const obsConnectedAt = validTimestamp(record.obsConnectedAt);
    const firstDonationAt = validTimestamp(record.firstDonationAt);
    const derivedLiveAlertDeliveredAt = obsConnectedAt && firstDonationAt && Date.parse(obsConnectedAt) <= Date.parse(firstDonationAt)
      ? firstDonationAt
      : null;
    const eventTimes = { ...record, liveAlertDeliveredAt: record.liveAlertDeliveredAt || derivedLiveAlertDeliveredAt };
    for (const milestone of milestones) {
      const timestamp = validTimestamp(eventTimes[milestone]);
      if (!timestamp) continue;
      totals[milestone].completed += 1;
      const duration = elapsedMilliseconds(oauthCompletedAt, timestamp);
      if (duration !== null) elapsed[milestone].push(duration);
    }
  }

  for (const milestone of milestones) {
    const values = elapsed[milestone].sort((a, b) => a - b);
    if (values.length) {
      const middle = Math.floor(values.length / 2);
      totals[milestone].medianMillisecondsFromOAuth = values.length % 2
        ? values[middle]
        : (values[middle - 1] + values[middle]) / 2;
    }
  }

  return { workspaces: records.length, milestones: totals };
}
