/**
 * Deterministic Presentation Queue for Donatio OBS Overlay
 * Manages ordered, non-overlapping sequential presentation of milestone triggers,
 * donation alerts, and goal completion celebrations with session deduplication.
 */

const MAX_SEEN_CACHE_SIZE = 200;
const MAX_QUEUE_SIZE = 30;
const STORAGE_KEY = 'donatio_overlay_seen_events';

export class PresentationQueue {
  constructor(options = {}) {
    this.onPresent = options.onPresent || (async () => {});
    this.onQueueEmpty = options.onQueueEmpty || (() => {});
    this.onStateChange = options.onStateChange || (() => {});
    
    this.queue = [];
    this.isBusy = false;
    this.currentEvent = null;
    this.seenKeys = new Set();
    
    // Load historical seen keys from sessionStorage if available
    this._loadSeenKeys();
  }

  _loadSeenKeys() {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        const raw = window.sessionStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            parsed.forEach(k => this.seenKeys.add(k));
          }
        }
      }
    } catch (_) {
      // Storage unavailable or disabled
    }
  }

  _persistSeenKeys() {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        const arr = Array.from(this.seenKeys).slice(-MAX_SEEN_CACHE_SIZE);
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
      }
    } catch (_) {
      // Storage full or disabled
    }
  }

  /**
   * Generates a stable deduplication identity for an event.
   * @param {Object} item
   * @returns {string}
   */
  generateKey(item) {
    if (!item) return '';
    if (item.triggerId) return `trigger:${item.triggerId}`;
    if (item.type === 'milestone') {
      const epoch = item.epoch ?? 1;
      return `milestone:${item.goalId || 'default'}:${epoch}:${item.thresholdPercent}`;
    }
    if (item.type === 'donation_alert') {
      return `alert:${item.alertId || `${item.payer}-${item.amount}-${item.timestamp}`}`;
    }
    if (item.type === 'goal_completion') {
      const epoch = item.epoch ?? 1;
      return `completion:${item.goalId || 'default'}:${epoch}`;
    }
    return `event:${item.type || 'generic'}:${item.id || item.timestamp || Math.random()}`;
  }

  /**
   * Checks if an event has already been seen and presented.
   * @param {string|Object} keyOrItem
   * @returns {boolean}
   */
  hasSeen(keyOrItem) {
    const key = typeof keyOrItem === 'string' ? keyOrItem : this.generateKey(keyOrItem);
    return this.seenKeys.has(key);
  }

  /**
   * Marks a key or event as seen.
   * @param {string|Object} keyOrItem
   */
  markSeen(keyOrItem) {
    const key = typeof keyOrItem === 'string' ? keyOrItem : this.generateKey(keyOrItem);
    if (!key) return;
    
    // Prune if exceeds max cache size
    if (this.seenKeys.size >= MAX_SEEN_CACHE_SIZE) {
      const first = this.seenKeys.values().next().value;
      if (first) this.seenKeys.delete(first);
    }
    
    this.seenKeys.add(key);
    this._persistSeenKeys();
  }

  /**
   * Enqueues an event for presentation.
   * Drops duplicates automatically.
   * @param {Object} item
   * @returns {boolean} Whether the item was queued
   */
  enqueue(item) {
    if (!item) return false;
    
    const key = this.generateKey(item);
    if (this.hasSeen(key)) {
      return false;
    }

    // Check if already in pending queue
    const alreadyQueued = this.queue.some(q => this.generateKey(q) === key);
    if (alreadyQueued) {
      return false;
    }

    const isCritical = item.type === 'milestone' || item.type === 'goal_completion';

    // Bounded queue protection: only drop transient donation alerts under pressure
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      const dropIndex = this.queue.findIndex(q => q.type === 'donation_alert');
      if (dropIndex !== -1) {
        this.queue.splice(dropIndex, 1);
      } else if (!isCritical) {
        // Drop transient alert if queue has only critical milestone events
        return false;
      }
      // Critical milestone/completion events are never dropped
    }

    this.queue.push(item);
    this.onStateChange({ queueLength: this.queue.length, isBusy: this.isBusy });
    
    this._processNext();
    return true;
  }

  /**
   * Enqueues multiple items in order (e.g. multi-threshold crossed milestones).
   * @param {Array<Object>} items
   * @returns {number} Number of items queued
   */
  enqueueBatch(items = []) {
    if (!Array.isArray(items)) return 0;
    let count = 0;
    // Sort milestones in ascending threshold order if applicable
    const sorted = [...items].sort((a, b) => (a.thresholdPercent || 0) - (b.thresholdPercent || 0));
    for (const item of sorted) {
      if (this.enqueue(item)) {
        count++;
      }
    }
    return count;
  }

  async _processNext() {
    if (this.isBusy || this.queue.length === 0) {
      if (!this.isBusy && this.queue.length === 0) {
        this.onQueueEmpty();
      }
      return;
    }

    this.isBusy = true;
    const item = this.queue.shift();
    this.currentEvent = item;
    
    const key = this.generateKey(item);
    this.markSeen(key);
    
    this.onStateChange({ queueLength: this.queue.length, isBusy: this.isBusy, currentEvent: item });

    try {
      await this.onPresent(item);
    } catch (err) {
      console.error('[PresentationQueue] Error during event presentation:', err);
    } finally {
      this.currentEvent = null;
      this.isBusy = false;
      this.onStateChange({ queueLength: this.queue.length, isBusy: this.isBusy, currentEvent: null });
      
      // Yield microtask before next event
      setTimeout(() => this._processNext(), 50);
    }
  }

  clear() {
    this.queue = [];
    this.onStateChange({ queueLength: 0, isBusy: this.isBusy, currentEvent: this.currentEvent });
  }

  resetSeenCache() {
    this.seenKeys.clear();
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch (_) {}
  }

  getQueueLength() {
    return this.queue.length;
  }

  isProcessing() {
    return this.isBusy;
  }
}

export default PresentationQueue;
