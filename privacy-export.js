// Builds a creator-owned data export from already-authorized records. This module is
// deliberately allowlist-based: adding a sensitive database column cannot make it into
// exports unless it is explicitly added here after review.
function pick(source, keys) {
  return Object.fromEntries(keys.flatMap(key => source?.[key] !== undefined ? [[key, source[key]]] : []));
}

function exportDonation(donation) {
  return pick(donation, ['id', 'amount', 'currency', 'payerName', 'message', 'status', 'createdAt', 'completedAt', 'refundedAt']);
}

export function buildAccountExport({ account, subscription, workspaces }) {
  return {
    format: 'donationbar.account-export.v1',
    exportedAt: new Date().toISOString(),
    account: pick(account, ['id', 'email', 'username', 'displayName', 'createdAt', 'lastLoginAt']),
    subscription: subscription ? pick(subscription, [
      'planType', 'status', 'pricePerMonth', 'currency', 'isTrial', 'trialEndDate',
      'billingCycleStart', 'nextBillingDate', 'lastPaymentDate', 'lastPaymentStatus',
      'failedPaymentCount', 'gracePeriodEndAt', 'pausedAt', 'canceledAt', 'createdAt', 'updatedAt'
    ]) : null,
    workspaces: workspaces.map(({ workspace, settings, provider, donations }) => ({
      workspace: pick(workspace, ['id', 'workspaceName', 'slug', 'description', 'donationUrl', 'overlayUrl', 'webhookUrl', 'isActive', 'isPublic', 'createdAt', 'updatedAt']),
      settings: pick(settings, [
        'goalTitle', 'goalAmount', 'goalStartFrom', 'totalAmount', 'totalDonationsCount',
        'overlaySettings', 'providerConfiguredAt', 'obsConnectedAt', 'firstDonationAt',
        'createdAt', 'updatedAt'
      ]),
      paymentProvider: { ecpayConfigured: Boolean(provider?.merchantId && provider?.hashKey && provider?.hashIV) },
      donations: donations.map(exportDonation)
    }))
  };
}
