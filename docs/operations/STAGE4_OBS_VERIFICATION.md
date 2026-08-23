# Stage 4 OBS Experience Verification Guide

## Purpose

This document specifies the end-to-end verification checklist for Donatio's Stage 4 OBS Overlay Experience across local development, staging (`https://donatio-staging.jjmowlab.com`), and production.

---

## 1. Automated Test Suite

Run the full automated test suite:

```bash
npm test
```

### Verified Test Matrix:
- `test/overlay-currency-formatter.test.js`: Validates ISO 4217 formatting (`TWD`, `USD`, `EUR`, `GBP`, `JPY`), minor unit conversion, prefix toggles.
- `test/overlay-presentation-queue.test.js`: Validates deterministic sequential multi-threshold execution (50% $\to$ 75% $\to$ 100%), deduplication across epochs, bounded memory.
- `test/overlay-audio.test.js`: Validates volume, mute, tone generation, and non-overlapping queue scheduling.
- `test/overlay-theme-manager.test.js`: Validates 3 shipped themes (`minimal`, `gaming`, `creator`), URL parameter overrides, and accessibility options.
- `test/overlay-realtime-client.test.js`: Validates URL builders, connection state transitions, backoff calculations, and state re-sync.
- `test/overlay-security-xss.test.js`: Validates XSS safety with HTML and JavaScript payloads in titles, donor names, messages, and milestone labels.
- `test/overlay-admin-test-event.test.js`: Validates the creator test event console, OBS 4-step setup instructions, and synthetic non-persisting event routing.
- `test/overlay-layout.test.js`: Validates transparency and viewport bounds across standard OBS aspect ratios.
- `test/overlay-reconnect.test.js`: Validates reconnect handlers and clean teardown.

---

## 2. Manual Staging Verification Checklist

Perform these steps on the staging environment:

### A. One-Click Copy & OBS Setup
1. Log into Creator Dashboard: `https://donatio-staging.jjmowlab.com/admin`
2. Navigate to **「斗內條與提醒」(Overlay & Alerts)** tab.
3. Click **「一鍵複製網址」(Copy OBS URL)** $\to$ Confirm toast feedback appears and clipboard contains the workspace overlay URL.
4. Verify the 4-step OBS Setup guide is visible and clear.

### B. Live Overlay Preview & Theme Switcher
1. Change **風格主題 (Theme)** to `電競霓虹 (Gaming)` $\to$ click **更新斗內條設定**.
2. Confirm the Live Preview iframe updates with gaming borders and cyan/pink glowing accents.
3. Change **風格主題 (Theme)** to `柔和創作者 (Creator)` $\to$ confirm smooth rounded pastel gradient styling.
4. Change back to `極簡俐落 (Minimal)` $\to$ confirm crisp clean emerald aesthetic.

### C. OBS Test Event Console
1. Open the OBS overlay in a test tab: `https://donatio-staging.jjmowlab.com/overlay/<slug>?test=1`
2. From the Admin Dashboard, click **測試進度 (+NT$300)** $\to$ confirm progress bar increments with smooth animation.
3. Click **測試 50% 里程碑** $\to$ confirm floating milestone banner appears with chime.
4. Click **測試 100% 達成慶祝** $\to$ confirm 100% celebration fanfare, glowing card, and confetti burst.
5. Click **測試音效** $\to$ confirm audio plays without clipping.
6. Verify database revenue totals on Overview tab remain unchanged (synthetic test events do not alter real accounting records).

### D. OBS Studio Browser Source Test
1. In OBS Studio, add a Browser Source with the URL: `https://donatio-staging.jjmowlab.com/overlay/<slug>`
2. Width: `800`, Height: `250`.
3. Confirm page background is completely transparent and does not display scrollbars.
4. Trigger a test event from the dashboard $\to$ verify OBS Studio renders animations in real-time.

---

## 3. Real OBS Sign-Off / Verification Results

| Item | Test Scenario | Expected Result | Sign-Off Status |
|---|---|---|---|
| 1 | **Transparent Browser Source** | OBS Canvas shows zero black/white box or layout shift | `[ ] PENDING OWNER SIGN-OFF` |
| 2 | **Initial Goal State** | Authoritative current/target amounts display immediately on load | `[ ] PENDING OWNER SIGN-OFF` |
| 3 | **Real-Time Progress Update** | Progress bar and numbers advance smoothly on contribution | `[ ] PENDING OWNER SIGN-OFF` |
| 4 | **Ordered Multi-Threshold Milestones** | Leaping 50% $\to$ 75% $\to$ 100% executes sequentially in order | `[ ] PENDING OWNER SIGN-OFF` |
| 5 | **Action Combinations** | `visualAction: false` plays sound only; `soundAction: false` plays visual only | `[ ] PENDING OWNER SIGN-OFF` |
| 6 | **100% Completion Celebration** | Fanfare and confetti trigger once per completion epoch | `[ ] PENDING OWNER SIGN-OFF` |
| 7 | **Network Disconnect & Reconnect** | SSE reconnects with exponential backoff and re-syncs state | `[ ] PENDING OWNER SIGN-OFF` |
| 8 | **Browser Source Reload** | Reloading OBS source does not replay already-seen milestone animations | `[ ] PENDING OWNER SIGN-OFF` |

