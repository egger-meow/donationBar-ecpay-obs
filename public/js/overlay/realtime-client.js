/**
 * Realtime Client for Donatio OBS Overlay
 * Manages Server-Sent Events (SSE) stream, initial state hydration,
 * resilient reconnection with exponential backoff & jitter, and authoritative state catch-up.
 */

export const CONNECTION_STATES = Object.freeze({
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  OFFLINE: 'offline'
});

const MAX_RECONNECT_DELAY = 30000; // 30s maximum backoff
const INITIAL_RECONNECT_DELAY = 1500; // 1.5s initial backoff

export class RealtimeClient {
  constructor(options = {}) {
    this.workspaceSlug = options.workspaceSlug || null;
    this.baseUrl = options.baseUrl || '';
    
    this.onProgress = options.onProgress || (() => {});
    this.onMilestone = options.onMilestone || (() => {});
    this.onOverlaySettings = options.onOverlaySettings || (() => {});
    this.onConnectionStateChange = options.onConnectionStateChange || (() => {});

    this.connectionState = CONNECTION_STATES.OFFLINE;
    this.eventSource = null;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.isDisposed = false;
  }

  setConnectionState(state, detail = {}) {
    if (this.connectionState !== state) {
      this.connectionState = state;
      this.onConnectionStateChange(state, detail);
    }
  }

  getConnectionState() {
    return this.connectionState;
  }

  buildProgressUrl() {
    const slug = this.workspaceSlug;
    return slug
      ? `${this.baseUrl}/progress?slug=${encodeURIComponent(slug)}`
      : `${this.baseUrl}/progress`;
  }

  buildEventsUrl() {
    const slug = this.workspaceSlug;
    return slug
      ? `${this.baseUrl}/events?slug=${encodeURIComponent(slug)}&source=overlay`
      : `${this.baseUrl}/events?source=overlay`;
  }

  buildSettingsUrl() {
    const slug = this.workspaceSlug;
    return slug
      ? `${this.baseUrl}/overlay-settings?slug=${encodeURIComponent(slug)}`
      : `${this.baseUrl}/overlay-settings`;
  }

  /**
   * Fetches the current authoritative goal progress from the server.
   * @returns {Promise<Object|null>}
   */
  async fetchGoalProgress() {
    try {
      const url = this.buildProgressUrl();
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      this.onProgress(data);
      return data;
    } catch (err) {
      console.warn('[RealtimeClient] Failed to fetch goal progress:', err.message);
      return null;
    }
  }

  /**
   * Fetches overlay appearance settings from the server.
   * @returns {Promise<Object|null>}
   */
  async fetchOverlaySettings() {
    try {
      const url = this.buildSettingsUrl();
      const res = await fetch(url);
      if (!res.ok) return null;
      const settings = await res.json();
      this.onOverlaySettings(settings);
      return settings;
    } catch (err) {
      return null;
    }
  }

  /**
   * Connects to Server-Sent Events stream.
   */
  connect() {
    if (this.isDisposed) return;
    this._cleanupEventSource();

    this.setConnectionState(
      this.reconnectAttempts === 0 ? CONNECTION_STATES.CONNECTING : CONNECTION_STATES.RECONNECTING,
      { attempt: this.reconnectAttempts }
    );

    const eventsUrl = this.buildEventsUrl();
    
    try {
      this.eventSource = new EventSource(eventsUrl);
    } catch (err) {
      console.error('[RealtimeClient] EventSource initialization failed:', err);
      this._scheduleReconnect();
      return;
    }

    this.eventSource.onopen = () => {
      const wasReconnecting = this.reconnectAttempts > 0;
      this.reconnectAttempts = 0;
      this.setConnectionState(CONNECTION_STATES.CONNECTED);

      // If recovering from a disconnect, re-fetch latest authoritative progress
      if (wasReconnecting) {
        this.fetchGoalProgress().catch(() => {});
      }
    };

    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.onProgress(data);
      } catch (err) {
        console.warn('[RealtimeClient] Error parsing message payload:', err);
      }
    };

    this.eventSource.addEventListener('milestone', (event) => {
      try {
        const milestoneData = JSON.parse(event.data);
        this.onMilestone(milestoneData);
      } catch (err) {
        console.warn('[RealtimeClient] Error parsing milestone payload:', err);
      }
    });

    this.eventSource.addEventListener('overlay-settings', (event) => {
      try {
        const settingsData = JSON.parse(event.data);
        this.onOverlaySettings(settingsData);
      } catch (err) {
        console.warn('[RealtimeClient] Error parsing overlay-settings payload:', err);
      }
    });

    this.eventSource.onerror = (error) => {
      if (this.isDisposed) return;
      this._cleanupEventSource();
      this._scheduleReconnect();
    };
  }

  _scheduleReconnect() {
    if (this.isDisposed || this.reconnectTimer) return;

    this.reconnectAttempts++;
    this.setConnectionState(CONNECTION_STATES.RECONNECTING, { attempt: this.reconnectAttempts });

    // Exponential backoff with jitter (0 to 500ms)
    const baseDelay = Math.min(
      INITIAL_RECONNECT_DELAY * Math.pow(1.5, this.reconnectAttempts - 1),
      MAX_RECONNECT_DELAY
    );
    const jitter = Math.floor(Math.random() * 500);
    const delay = baseDelay + jitter;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  _cleanupEventSource() {
    if (this.eventSource) {
      try {
        this.eventSource.close();
      } catch (_) {}
      this.eventSource = null;
    }
  }

  disconnect() {
    this.isDisposed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this._cleanupEventSource();
    this.setConnectionState(CONNECTION_STATES.OFFLINE);
  }
}

export default RealtimeClient;
