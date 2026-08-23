/**
 * Safe Overlay DOM Renderer for Donatio OBS Overlay
 * Strict XSS protection using textContent and safe DOM construction.
 * Renders goal cards, progress bars, overshoot percentages, milestone banners,
 * and confetti celebration effects.
 */

import { formatCurrencyAmount, majorToMinor } from './currency-formatter.js';

export class OverlayRenderer {
  constructor(containerElement, options = {}) {
    this.container = containerElement;
    this.locale = options.locale || 'zh-TW';
    
    // Internal elements map
    this.elements = {};
    this.currentData = null;
    this.confettiTimer = null;

    this._buildInitialDOM();
  }

  _buildInitialDOM() {
    if (!this.container) return;

    // Reset container safely
    this.container.textContent = '';

    // Goal Card Container
    const card = document.createElement('div');
    card.className = 'goal-card';
    this.elements.card = card;

    // Milestone Floating Banner
    const milestoneBanner = document.createElement('div');
    milestoneBanner.className = 'milestone-banner';
    this.elements.milestoneBanner = milestoneBanner;
    card.appendChild(milestoneBanner);

    // Goal Header
    const header = document.createElement('div');
    header.className = 'goal-header';

    const title = document.createElement('h1');
    title.className = 'goal-title';
    title.textContent = '載入中...';
    this.elements.title = title;
    header.appendChild(title);

    const badge = document.createElement('span');
    badge.className = 'goal-badge';
    badge.style.display = 'none';
    this.elements.badge = badge;
    header.appendChild(badge);

    card.appendChild(header);

    // Progress Section
    const progressSection = document.createElement('div');
    progressSection.className = 'progress-section';

    const track = document.createElement('div');
    track.className = 'progress-track';

    const fill = document.createElement('div');
    fill.className = 'progress-bar-fill';
    this.elements.fill = fill;
    track.appendChild(fill);

    progressSection.appendChild(track);

    const percentage = document.createElement('div');
    percentage.className = 'percentage-display';
    percentage.textContent = '0%';
    this.elements.percentage = percentage;
    progressSection.appendChild(percentage);

    card.appendChild(progressSection);

    // Amount Sub-row
    const amountRow = document.createElement('div');
    amountRow.className = 'amount-row';

    const currentSpan = document.createElement('span');
    currentSpan.className = 'current-amount';
    currentSpan.textContent = 'NT$ 0';
    this.elements.currentSpan = currentSpan;
    amountRow.appendChild(currentSpan);

    const dividerSpan = document.createElement('span');
    dividerSpan.textContent = ' / ';
    amountRow.appendChild(dividerSpan);

    const targetSpan = document.createElement('span');
    targetSpan.className = 'target-amount';
    targetSpan.textContent = 'NT$ 0';
    this.elements.targetSpan = targetSpan;
    amountRow.appendChild(targetSpan);

    card.appendChild(amountRow);

    // Recent Supporter Box
    const supporterBox = document.createElement('div');
    supporterBox.className = 'recent-supporter-box';
    supporterBox.style.display = 'none';

    const heartIcon = document.createElement('span');
    heartIcon.textContent = '💖 ';
    supporterBox.appendChild(heartIcon);

    const supporterName = document.createElement('span');
    supporterName.className = 'recent-supporter-name';
    this.elements.supporterName = supporterName;
    supporterBox.appendChild(supporterName);

    const supporterAmount = document.createElement('span');
    supporterAmount.className = 'recent-supporter-amount';
    this.elements.supporterAmount = supporterAmount;
    supporterBox.appendChild(supporterAmount);

    const supporterMessage = document.createElement('span');
    supporterMessage.className = 'recent-supporter-message';
    this.elements.supporterMessage = supporterMessage;
    supporterBox.appendChild(supporterMessage);

    this.elements.supporterBox = supporterBox;
    card.appendChild(supporterBox);

    this.container.appendChild(card);
  }

  /**
   * Renders the authoritative Goal Progress state.
   * Handles minor units and major values gracefully.
   * @param {Object} data
   */
  renderProgress(data = {}) {
    if (!data) return;
    this.currentData = data;

    const titleText = data.title || (data.goal?.title) || '斗內目標';
    this.elements.title.textContent = titleText;

    const currency = data.currency || (data.goal?.displayCurrency) || 'TWD';
    
    // Check if values are in integer minor units (from Stage 3 Goal Engine) or major units
    let currentMinor = 0;
    let targetMinor = 0;

    if (Number.isFinite(data.currentAmountMinor) && Number.isFinite(data.targetAmountMinor)) {
      currentMinor = data.currentAmountMinor;
      targetMinor = data.targetAmountMinor;
    } else if (Number.isFinite(data.current) && Number.isFinite(data.goal)) {
      // Legacy major unit fallback - convert using actual currency exponent, NEVER blindly * 100
      currentMinor = majorToMinor(data.current, currency);
      targetMinor = majorToMinor(data.goal, currency);
    }

    const percent = targetMinor > 0
      ? Math.floor((currentMinor / targetMinor) * 100)
      : (Number(data.percent) || 0);

    // Update Percentage Display (supports overshoot, e.g. 120%)
    this.elements.percentage.textContent = `${percent}%`;

    // Progress Bar Fill Width (visually capped at 100% max)
    const visualWidth = Math.min(100, Math.max(0, percent));
    this.elements.fill.style.width = `${visualWidth}%`;

    // Format amounts
    this.elements.currentSpan.textContent = formatCurrencyAmount(currentMinor, currency, { locale: this.locale });
    this.elements.targetSpan.textContent = formatCurrencyAmount(targetMinor, currency, { locale: this.locale });

    // Status Badge
    const isComplete = percent >= 100;
    if (isComplete) {
      this.elements.badge.textContent = '🎉 目標達成！';
      this.elements.badge.className = 'goal-badge complete';
      this.elements.badge.style.display = 'inline-flex';
      this.elements.card.classList.add('goal-completed-card');
    } else {
      this.elements.badge.style.display = 'none';
      this.elements.card.classList.remove('goal-completed-card');
    }

    // Recent Supporter Info
    const latest = data.latestDonation || (data.donations && data.donations[0]);
    if (latest && (latest.payer || latest.supporterName)) {
      const name = latest.payer || latest.supporterName || '匿名觀眾';
      const donationCurrency = latest.currency || currency;
      let amtStr = '';
      if (Number.isFinite(latest.amountMinor)) {
        amtStr = formatCurrencyAmount(latest.amountMinor, donationCurrency, { locale: this.locale });
      } else if (Number.isFinite(latest.amount)) {
        amtStr = formatCurrencyAmount(majorToMinor(latest.amount, donationCurrency), donationCurrency, { locale: this.locale });
      }
      const msg = latest.message ? `：${latest.message}` : '';

      this.elements.supporterName.textContent = name;
      this.elements.supporterAmount.textContent = amtStr ? ` (${amtStr})` : '';
      this.elements.supporterMessage.textContent = msg;
      this.elements.supporterBox.style.display = 'flex';
    } else {
      this.elements.supporterBox.style.display = 'none';
    }
  }

  /**
   * Triggers a milestone celebration animation on the overlay.
   * @param {Object} milestone
   * @param {number} [durationMs=4000]
   * @returns {Promise<void>}
   */
  async presentMilestone(milestone = {}, durationMs = 4000) {
    if (milestone.visualAction === false) {
      return;
    }

    const label = milestone.label || `${milestone.thresholdPercent}% 里程碑達成！`;
    
    // Set banner text safely
    this.elements.milestoneBanner.textContent = `🎯 ${label}`;
    this.elements.milestoneBanner.classList.add('active');

    // Shimmer bar and pulse card
    this.elements.fill.classList.add('shimmer-active');
    this.elements.card.classList.add('pulse-active');

    this.triggerConfetti(25);

    return new Promise((resolve) => {
      setTimeout(() => {
        this.elements.milestoneBanner.classList.remove('active');
        this.elements.fill.classList.remove('shimmer-active');
        this.elements.card.classList.remove('pulse-active');
        resolve();
      }, durationMs);
    });
  }

  /**
   * Triggers a 100% Goal Completion celebration.
   * @param {Object} goal
   * @param {number} [durationMs=5000]
   * @returns {Promise<void>}
   */
  async presentCompletion(goal = {}, durationMs = 5000) {
    if (goal.visualAction === false) {
      return;
    }

    const title = goal.title || this.elements.title.textContent || '目標達成';
    this.elements.milestoneBanner.textContent = `🏆 ${title} 100% 達成！`;
    this.elements.milestoneBanner.classList.add('active');
    this.elements.card.classList.add('goal-completed-card', 'pulse-active');

    this.triggerConfetti(40);

    return new Promise((resolve) => {
      setTimeout(() => {
        this.elements.milestoneBanner.classList.remove('active');
        this.elements.card.classList.remove('pulse-active');
        resolve();
      }, durationMs);
    });
  }

  /**
   * Spawns lightweight confetti particles in the viewport without memory leak.
   * @param {number} count
   */
  triggerConfetti(count = 30) {
    if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return;

    let layer = document.getElementById('confettiLayer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'confettiLayer';
      layer.className = 'confetti-layer';
      document.body.appendChild(layer);
    }

    const fragment = document.createDocumentFragment();
    const colors = ['#10b981', '#3b82f6', '#ec4899', '#f59e0b', '#8b5cf6', '#06b6d4'];

    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'confetti-particle';
      p.style.left = `${Math.random() * 100}vw`;
      p.style.backgroundColor = colors[i % colors.length];
      p.style.animationDelay = `${Math.random() * 0.8}s`;
      p.style.animationDuration = `${2 + Math.random() * 1.5}s`;
      p.style.borderRadius = i % 2 === 0 ? '50%' : '2px';
      fragment.appendChild(p);
    }

    layer.appendChild(fragment);

    if (this.confettiTimer) {
      clearTimeout(this.confettiTimer);
    }

    this.confettiTimer = setTimeout(() => {
      if (layer) layer.textContent = '';
      this.confettiTimer = null;
    }, 4500);
  }
}

export default OverlayRenderer;
