/**
 * Main Controller for Donatio OBS Overlay
 * Coordinates ThemeManager, AudioController, PresentationQueue, OverlayRenderer, and RealtimeClient.
 */

import { ThemeManager } from './theme-manager.js';
import { AudioController } from './audio-controller.js';
import { PresentationQueue } from './presentation-queue.js';
import { OverlayRenderer } from './overlay-renderer.js';
import { RealtimeClient } from './realtime-client.js';

export class OverlayApp {
  constructor() {
    this.container = document.getElementById('overlayApp') || document.getElementById('wrap') || document.body;
    
    // Extract workspace slug from URL (/overlay/:slug or ?slug=)
    this.workspaceSlug = this._extractWorkspaceSlug();
    this.queryParams = new URLSearchParams(window.location.search);
    this.isTestMode = this.queryParams.get('test') === '1';

    // 1. Initialize Subsystems
    this.themeManager = new ThemeManager();
    this.themeManager.parseUrlParams(window.location.search);

    this.audioController = new AudioController();

    this.renderer = new OverlayRenderer(this.container, {
      locale: this.queryParams.get('lang') || 'zh-TW'
    });

    this.queue = new PresentationQueue({
      onPresent: async (item) => {
        await this._handlePresentationItem(item);
      }
    });

    this.client = new RealtimeClient({
      workspaceSlug: this.workspaceSlug,
      onProgress: (data) => {
        this.renderer.renderProgress(data);
      },
      onMilestone: (milestone) => {
        this.queue.enqueue(milestone);
      },
      onOverlaySettings: (settings) => {
        this._applySettings(settings);
      },
      onConnectionStateChange: (state, detail) => {
        // Silent state tracking without stream error banners
        if (state === 'reconnecting') {
          console.log(`[Overlay] Realtime reconnecting (attempt ${detail.attempt || 1})...`);
        }
      }
    });
  }

  _extractWorkspaceSlug() {
    const path = window.location.pathname;
    const match = path.match(/^\/overlay\/([^\/]+)$/);
    if (match) return match[1];
    const params = new URLSearchParams(window.location.search);
    return params.get('slug') || null;
  }

  _applySettings(settings = {}) {
    if (settings.theme) {
      this.themeManager.setTheme(settings.theme);
    }
    if (settings.progressBarColor || settings.fontColor || settings.backgroundColor) {
      this.themeManager.setColorOverrides({
        bar: settings.progressBarColor,
        fg: settings.fontColor,
        bg: settings.backgroundColor
      });
    }
    if (settings.alertSoundVolume !== undefined) {
      this.audioController.setVolume(settings.alertSoundVolume);
    }
    if (settings.alertSound === false) {
      this.audioController.setMuted(true);
    }
  }

  async _handlePresentationItem(item) {
    if (item.type === 'milestone') {
      const isSound = item.soundAction !== false;
      const isVisual = item.visualAction !== false;

      if (isSound) {
        if (item.thresholdPercent >= 100) {
          this.audioController.queueSound('completion');
        } else {
          this.audioController.queueSound('milestone');
        }
      }

      if (isVisual) {
        if (item.thresholdPercent >= 100) {
          await this.renderer.presentCompletion({ title: item.goalTitle || item.label, visualAction: true }, 5000);
        } else {
          await this.renderer.presentMilestone(item, 4000);
        }
      } else if (isSound) {
        // Provide a bounded pause for audio playback before advancing queue
        await new Promise(r => setTimeout(r, 600));
      }
    } else if (item.type === 'donation_alert') {
      const isSound = item.soundAction !== false;
      const isVisual = item.visualAction !== false;

      if (isSound) {
        this.audioController.queueSound('donation');
      }
      if (isVisual) {
        await this.renderer.presentMilestone({
          label: `${item.payer || '觀眾'} 斗內了！`,
          visualAction: true
        }, 3500);
      } else if (isSound) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }

  start() {
    if (this.isTestMode) {
      this._startTestLoop();
      return;
    }

    // Normal Production OBS Sequence:
    // 1. Fetch settings
    this.client.fetchOverlaySettings().catch(() => {});
    // 2. Fetch authoritative initial state and render immediately
    this.client.fetchGoalProgress().catch(() => {});
    // 3. Connect SSE realtime stream
    this.client.connect();

    // Clean up on window unload
    window.addEventListener('beforeunload', () => {
      this.client.disconnect();
    });
  }

  _startTestLoop() {
    console.log('[OverlayApp] Test mode active (?test=1). Simulating progress & milestones...');
    let percent = 0;
    const testGoal = {
      title: '測試直播目標 (OBS Test Mode)',
      currentAmountMinor: 0,
      targetAmountMinor: 1000000,
      displayCurrency: 'TWD',
      latestDonation: {
        payer: '測試觀眾',
        amountMinor: 10000,
        message: '這是一個即時測試提示！'
      }
    };

    this.renderer.renderProgress(testGoal);

    const interval = setInterval(() => {
      percent += 25;
      testGoal.currentAmountMinor = percent * 10000;
      this.renderer.renderProgress(testGoal);

      if (percent === 50) {
        this.queue.enqueue({
          type: 'milestone',
          goalId: 'test-goal',
          thresholdPercent: 50,
          label: '50% 半程達成！',
          visualAction: true,
          soundAction: true,
          epoch: 1
        });
      } else if (percent === 100) {
        this.queue.enqueue({
          type: 'milestone',
          goalId: 'test-goal',
          thresholdPercent: 100,
          label: '100% 目標圓滿達成！',
          visualAction: true,
          soundAction: true,
          epoch: 1
        });
      }

      if (percent >= 100) {
        percent = 0;
      }
    }, 4500);

    window.addEventListener('beforeunload', () => clearInterval(interval));
  }
}

// Auto-initialize when loaded in browser
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    window.overlayAppInstance = new OverlayApp();
    window.overlayAppInstance.start();
  });
}

export default OverlayApp;
