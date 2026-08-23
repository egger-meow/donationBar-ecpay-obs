# OBS Audio Architecture & Controller

## Overview

The `AudioController` provides reliable, copyright-free sound synthesis and custom audio playback for the Donatio OBS Browser Source.

---

## Capabilities

1. **Programmatic Web Audio Synthesis**:
   - Zero external audio assets required for base operation.
   - **Milestone Chime**: 3-note ascending melodic chime (C5 $523.25\text{Hz}$ $\to$ E5 $659.25\text{Hz}$ $\to$ G5 $783.99\text{Hz}$).
   - **100% Completion Fanfare**: 4-note celebration arpeggio (C5 $\to$ E5 $\to$ G5 $\to$ C6 $1046.50\text{Hz}$).
   - Smooth ADSR gain envelope to prevent audio clicking or popping.

2. **Custom Audio Support**:
   - Creator can upload custom audio files (mp3, wav, ogg) via the Admin Dashboard.
   - Falls back gracefully to synthesized Web Audio chime if custom audio fails to load or decode.

3. **Volume & Mute Control**:
   - Volume slider (0 - 100).
   - Global mute toggle (`setMuted(true)`).
   - Linear scale mapped to oscillator / audio gain node.

4. **Sequential Audio Scheduling**:
   - Internal `audioQueue` prevents simultaneous sound clipping when multiple donations arrive in rapid succession.

5. **Browser Autoplay & OBS Configuration**:
   - Automatically attaches one-time user interaction unlock listeners (`click`, `keydown`).
   - In OBS Browser Source properties, creators should check:
     - **Control audio via OBS** (optional, routes audio into OBS mixer)
     - **Refresh browser when scene becomes active** (recommended)
