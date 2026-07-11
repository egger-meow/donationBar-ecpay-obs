// Pure computation for the guided-activation checklist (ROADMAP.md P1 "Guided
// activation"). Takes already-fetched workspace state and returns the checklist shape
// served by GET /admin/activation and rendered by public/admin.html.
//
// "liveAlertConfirmed" is a heuristic, not a confirmed visual observation: it is true
// once the OBS overlay has connected at least once AND at least one donation has been
// recorded, on the basis that the existing SSE broadcast path delivers a donation update
// to any already-connected overlay client automatically (see broadcastProgress in
// server.js). It does not prove the alert was seen on screen.
export function computeActivationSteps({ provider, settings }) {
  const ecpayConfigured = Boolean(provider && provider.merchantId && provider.hashKey && provider.hashIV);
  const obsConnectedAt = settings?.obsConnectedAt || null;
  const firstDonationAt = settings?.firstDonationAt || null;
  const obsConnected = Boolean(obsConnectedAt);
  const firstDonation = Boolean(firstDonationAt);

  return {
    ecpayConfigured,
    obsConnected: { done: obsConnected, at: obsConnectedAt },
    firstDonation: { done: firstDonation, at: firstDonationAt },
    liveAlertConfirmed: obsConnected && firstDonation
  };
}
