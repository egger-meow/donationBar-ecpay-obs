/**
 * Audio Controller for Donatio OBS Overlay
 * Manages sound playback, Web Audio synthesized tones, volume control, mute,
 * and sequential audio scheduling to prevent sound overlapping.
 */

export class AudioController {
  constructor(options = {}) {
    this.volume = options.volume ?? 80; // 0 to 100
    this.isMuted = options.isMuted ?? false;
    this.customSoundUrl = options.customSoundUrl || null;
    
    this.audioContext = null;
    this.isUnlocked = false;
    this.audioQueue = [];
    this.isPlayingAudio = false;

    // Attach unlock listener for browser autoplay restrictions
    this._attachAutoplayUnlock();
  }

  _attachAutoplayUnlock() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const unlock = () => {
      this.unlockAudio();
      document.removeEventListener('click', unlock);
      document.removeEventListener('keydown', unlock);
    };

    document.addEventListener('click', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });
  }

  /**
   * Initializes or resumes the Web Audio AudioContext on user interaction.
   */
  unlockAudio() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx && !this.audioContext) {
        this.audioContext = new AudioCtx();
      }
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }
      this.isUnlocked = true;
    } catch (_) {}
  }

  getAudioContext() {
    if (!this.audioContext && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.audioContext = new AudioCtx();
      }
    }
    return this.audioContext;
  }

  setVolume(volume) {
    const num = Number(volume);
    if (Number.isFinite(num)) {
      this.volume = Math.max(0, Math.min(100, num));
    }
  }

  setMuted(muted) {
    this.isMuted = Boolean(muted);
  }

  getEffectiveVolume() {
    if (this.isMuted) return 0;
    return this.volume / 100;
  }

  /**
   * Synthesizes a pleasant melodic tone sequence using Web Audio oscillator.
   * Zero external dependencies or copyright risk.
   *
   * @param {Array<{freq: number, duration: number, type?: OscillatorType}>} notes
   * @returns {Promise<void>}
   */
  async playToneSequence(notes = []) {
    const gainVolume = this.getEffectiveVolume();
    if (gainVolume <= 0 || notes.length === 0) return;

    const ctx = this.getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => {});
    }

    let currentTime = ctx.currentTime;

    return new Promise((resolve) => {
      const totalDuration = notes.reduce((sum, n) => sum + (n.duration || 0.15), 0);

      notes.forEach(note => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = note.type || 'sine';
        osc.frequency.setValueAtTime(note.freq, currentTime);

        // Envelope: soft attack, exponential decay
        const duration = note.duration || 0.15;
        gain.gain.setValueAtTime(0.001, currentTime);
        gain.gain.exponentialRampToValueAtTime(gainVolume * 0.4, currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, currentTime + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(currentTime);
        osc.stop(currentTime + duration);

        currentTime += duration;
      });

      setTimeout(resolve, totalDuration * 1000 + 50);
    });
  }

  /**
   * Plays a 3-note ascending milestone chime (C5 -> E5 -> G5).
   */
  async playMilestoneChime() {
    return this.playToneSequence([
      { freq: 523.25, duration: 0.12, type: 'triangle' }, // C5
      { freq: 659.25, duration: 0.12, type: 'triangle' }, // E5
      { freq: 783.99, duration: 0.28, type: 'sine' }     // G5
    ]);
  }

  /**
   * Plays a celebratory completion fanfare (C5 -> E5 -> G5 -> C6).
   */
  async playCompletionFanfare() {
    return this.playToneSequence([
      { freq: 523.25, duration: 0.10, type: 'triangle' }, // C5
      { freq: 659.25, duration: 0.10, type: 'triangle' }, // E5
      { freq: 783.99, duration: 0.10, type: 'triangle' }, // G5
      { freq: 1046.50, duration: 0.45, type: 'sine' }    // C6
    ]);
  }

  /**
   * Plays a donation alert tone or custom sound file.
   * @param {string} [customUrl]
   * @returns {Promise<void>}
   */
  async playDonationSound(customUrl = null) {
    const urlToUse = customUrl || this.customSoundUrl;
    const volume = this.getEffectiveVolume();
    if (volume <= 0) return;

    if (urlToUse && typeof Audio !== 'undefined') {
      return new Promise((resolve) => {
        try {
          const audio = new Audio(urlToUse);
          audio.volume = volume;
          audio.onended = () => resolve();
          audio.onerror = () => {
            // Fallback to synthesized chime on audio error
            this.playMilestoneChime().then(resolve);
          };
          audio.play().catch(() => {
            this.playMilestoneChime().then(resolve);
          });
        } catch (_) {
          this.playMilestoneChime().then(resolve);
        }
      });
    }

    // Default gentle chime
    return this.playMilestoneChime();
  }

  /**
   * Queues a sound action to prevent overlapping audio clipping.
   * @param {'milestone'|'completion'|'donation'} type
   * @param {string} [customUrl]
   */
  queueSound(type = 'milestone', customUrl = null) {
    if (this.isMuted || this.volume <= 0) return;

    this.audioQueue.push({ type, customUrl });
    this._processAudioQueue();
  }

  async _processAudioQueue() {
    if (this.isPlayingAudio || this.audioQueue.length === 0) return;

    this.isPlayingAudio = true;
    const task = this.audioQueue.shift();

    try {
      if (task.type === 'milestone') {
        await this.playMilestoneChime();
      } else if (task.type === 'completion') {
        await this.playCompletionFanfare();
      } else if (task.type === 'donation') {
        await this.playDonationSound(task.customUrl);
      }
    } catch (_) {
    } finally {
      this.isPlayingAudio = false;
      if (this.audioQueue.length > 0) {
        setTimeout(() => this._processAudioQueue(), 100);
      }
    }
  }
}

export default AudioController;
