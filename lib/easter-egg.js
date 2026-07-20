// Sanctioned free-pass easter egg (docs/features/EASTER_EGG.md): submitting the
// exact secret phrase as feedback upgrades the submitting user's subscription to
// a permanent free_pass. Reinstated 2026-07-20 at the owner's request after the
// 2026-07-12 security pass had removed it as a suspected backdoor. Every grant
// must be audit-logged; the grant fires at most once per user (already-free_pass
// users just submit feedback normally).
//
// NOTE: this repository is public, so the phrase is not actually secret — treat
// it as a promo code that can be rotated, not as a security boundary.

export const FREE_PASS_SECRET_CODE = 'jjmow is my daddy fuck fuck fuck';

export const FREE_PASS_SUBSCRIPTION_UPDATE = Object.freeze({
  planType: 'free_pass',
  status: 'active',
  isTrial: false,
  trialEndDate: null,
  pricePerMonth: 0
});

/**
 * Checks a submitted feedback message for the secret phrase and, when it
 * matches, upgrades the user's subscription and writes the audit event.
 *
 * @returns {Promise<boolean>} true when the free pass was granted just now.
 * @throws when the database rejects the upgrade — the caller decides whether
 *   that failure should affect the surrounding feedback submission.
 */
export async function maybeActivateFreePass({ database, userId, message, feedbackId }) {
  if (typeof message !== 'string' || message.trim() !== FREE_PASS_SECRET_CODE) {
    return false;
  }

  const subscription = await database.getUserSubscription(userId);
  if (!subscription || subscription.planType === 'free_pass') {
    return false;
  }

  await database.updateSubscription(userId, { ...FREE_PASS_SUBSCRIPTION_UPDATE });
  await database.addAuditLog({
    userId,
    action: 'subscription.free_pass_granted',
    resourceType: 'subscription',
    resourceId: feedbackId,
    status: 'success',
    metadata: {
      source: 'easter_egg',
      grantedAt: new Date().toISOString()
    }
  });
  return true;
}
