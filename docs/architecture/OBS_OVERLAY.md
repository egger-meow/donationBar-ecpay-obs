# OBS Overlay Architecture & Design

## Overview

Donatio's OBS Browser Source is a zero-framework, dependency-free presentation layer designed specifically for live streamers using OBS Studio, Streamlabs Desktop, or Prism Live Studio.

The overlay renders real-time programmable Goal progress, milestone celebration triggers, donation alerts, and audio cues while adhering strictly to OBS Browser Source performance and transparency requirements.

---

## Key Design Principles

1. **Strict Transparency & Zero Accidental Backgrounds**:
   - `background: transparent !important;` on `html` and `body`.
   - No scrollbars, overflow hidden.
   - Smooth GPU-accelerated transforms without layout shifts.

2. **Modular Vanilla Architecture**:
   - `public/js/overlay/currency-formatter.js`: Locale-aware ISO 4217 formatting (`TWD`, `USD`, `EUR`, `GBP`, `JPY`).
   - `public/js/overlay/presentation-queue.js`: Deterministic ordered queue for milestone triggers and alerts.
   - `public/js/overlay/audio-controller.js`: Web Audio synthesized tones and audio playback with autoplay unlocking.
   - `public/js/overlay/theme-manager.js`: 3 curated themes with CSS variables and dynamic overrides.
   - `public/js/overlay/realtime-client.js`: Resilient SSE client with backoff and authoritative state catch-up.
   - `public/js/overlay/overlay-renderer.js`: Safe DOM rendering with strict XSS prevention (`textContent`).
   - `public/js/overlay/overlay-app.js`: Main coordinator.

3. **Multi-Viewport Safety**:
   - Fully responsive across:
     - `800 x 250` (Standard horizontal banner in OBS)
     - `600 x 200` (Compact horizontal banner)
     - `1920 x 1080` (Full 16:9 canvas)
     - `1280 x 720` (720p stream canvas)
     - `1080 x 1920` (9:16 Vertical/Shorts live broadcast)

4. **Curated Themes**:
   - **Minimal (`minimal`)**: Crisp clean monochrome with refined borders and emerald progress accent (`#10b981`).
   - **Gaming (`gaming`)**: Cyberpunk angular styling with neon cyan (`#06b6d4`) and pink (`#ec4899`) radiant glow.
   - **Creator (`creator`)**: Soft rounded card glassmorphism with purple/pink pastel gradients (`#8b5cf6`, `#fb7185`).

5. **Security & Data Sanitization**:
   - All donor names, messages, goal titles, and milestone labels are strictly sanitized and rendered via `textContent` or DOM element properties.
   - Never injects unsanitized HTML into the DOM.
