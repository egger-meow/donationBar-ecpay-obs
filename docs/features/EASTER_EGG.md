# 🎁 Easter Egg: Free Pass Activation

> **Status (2026-07-20): live.** Implemented in [lib/easter-egg.js](../../lib/easter-egg.js)
> (`maybeActivateFreePass`), called from `POST /api/feedback` in `server.js`, covered by
> `test/easter-egg.test.js`. The 2026-07-12 security pass had removed this as a suspected
> backdoor; it was deliberately reinstated at the owner's request as a sanctioned,
> audited mechanic. ⚠️ This repository is **public**, so the phrase below is not actually
> secret — treat it as a rotatable promo code (change the constant in
> `lib/easter-egg.js` to rotate it), never as a security boundary.

## Secret Mechanic

A hidden Easter egg has been implemented that grants users a **permanent Free Pass** subscription.

---

## How It Works

### Activation Method:
1. User opens the **Feedback Modal** in admin panel
2. User types the exact message:
   ```
   jjmow is my daddy fuck fuck fuck
   ```
3. User submits the feedback

### What Happens:
1. ✅ Feedback is stored normally in the database
2. 🎁 **Secret code is detected** and triggers the Easter egg
3. 🎉 User's subscription is automatically upgraded to `free_pass`
4. 💎 Subscription changes:
   - `planType`: `"free_pass"`
   - `status`: `"active"`
   - `isTrial`: `false`
   - `trialEndDate`: `null`
   - `pricePerMonth`: `0`
5. 🎊 Special celebration message is displayed
6. 📜 Audit log records the free pass grant with source: `"easter_egg"`
7. 🔄 Subscription status automatically refreshes in the UI

---

## User Experience

### Normal Feedback:
```
✅ 感謝您的回饋！我們會仔細閱讀您的意見。
[Modal closes after 1.5 seconds]
```

### Easter Egg Activated:
```
🎊🎉 恭喜！您已解鎖永久 Free Pass！感謝您的熱情支持！🎁🎊
[Subscription badge updates to "FREE PASS"]
[Modal closes after 3 seconds]
```

---

## Technical Implementation

### Backend (server.js)

```javascript
// Easter egg: Secret free pass activation 🎁
const secretCode = "jjmow is my daddy fuck fuck fuck";
let easterEggActivated = false;

if (message.trim() === secretCode) {
  // Upgrade user to free_pass
  await database.updateSubscription(workspace.userId, {
    planType: 'free_pass',
    status: 'active',
    isTrial: false,
    trialEndDate: null,
    pricePerMonth: 0
  });
  
  easterEggActivated = true;
  
  // Log special audit event
  await database.addAuditLog({
    userId: workspace.userId,
    action: 'subscription.free_pass_granted',
    resourceType: 'subscription',
    resourceId: feedback.id,
    status: 'success',
    metadata: { 
      source: 'easter_egg',
      grantedAt: new Date().toISOString()
    }
  });
}

// Return special message
res.json({ 
  success: true, 
  message: easterEggActivated 
    ? '🎉 恭喜！您已解鎖永久 Free Pass！感謝您的熱情支持！🎁' 
    : 'Feedback submitted successfully',
  feedbackId: feedback.id,
  specialReward: easterEggActivated
});
```

### Frontend (admin.html)

```javascript
if (result.specialReward) {
  // Special celebration
  showAlert('🎊🎉 ' + result.message + ' 🎁🎊', 'success');
  
  // Reload subscription status
  setTimeout(async () => {
    const userResponse = await fetch('/api/user/info');
    const userData = await userResponse.json();
    if (userData.success && userData.subscription) {
      renderSubscriptionStatus(userData.subscription);
    }
  }, 1000);
  
  // Close modal after 3 seconds
  setTimeout(() => {
    toggleFeedbackModal();
    feedbackForm.reset();
  }, 3000);
}
```

### Database (database.js)

New method added:
```javascript
async updateSubscription(userId, updateData)
```

Supports updating:
- `planType`
- `status`
- `isTrial`
- `trialEndDate`
- `pricePerMonth`
- `nextBillingDate`

---

## Free Pass Benefits

Once activated, the user receives:

✅ **Unlimited donations** - No monthly limits  
✅ **Unlimited API calls** - No daily limits  
✅ **Full overlay features** - Complete customization  
✅ **Advanced features** - All premium functions  
✅ **Priority support** - Technical assistance  
✅ **No expiration** - Permanent access  
✅ **No payment required** - Forever free  

---

## Security Notes

- ✅ Easter egg only works for logged-in users
- ✅ Requires `requireAdmin` middleware (user must be authenticated)
- ✅ Case-sensitive exact match required
- ✅ Trimmed whitespace to prevent accidental spaces
- ✅ Audit log tracks all free pass grants
- ✅ Error handling prevents server crashes if upgrade fails

---

## Audit Trail

Every free pass activation is logged:

```json
{
  "userId": "user-id",
  "action": "subscription.free_pass_granted",
  "resourceType": "subscription",
  "resourceId": "feedback-id",
  "status": "success",
  "metadata": {
    "source": "easter_egg",
    "grantedAt": "2025-11-13T04:39:00.000Z"
  }
}
```

---

## Testing

To test the Easter egg:

1. Log into admin panel
2. Click **回饋建議** button in navbar
3. Select any feedback type
4. Enter message: `jjmow is my daddy fuck fuck fuck`
5. Click submit
6. Watch for celebration message
7. Verify subscription badge changes to "FREE PASS"
8. Check subscription details show permanent access

---

## Notes

- 🎯 The exact phrase must be typed correctly (case-sensitive)
- 🔒 Works only once per user (subsequent submissions just submit feedback normally)
- 📝 Feedback is still saved to database regardless
- 🎉 Provides immediate gratification and surprise for users who discover it
- 💡 Can be used as a reward for beta testers or special users

---

**Keep this mechanic secret to maintain the surprise factor!** 🤫
