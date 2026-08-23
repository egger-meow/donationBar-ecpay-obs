/**
 * Theme Manager for Donatio OBS Overlay
 * Manages 3 curated themes (Minimal, Gaming, Creator), CSS variable injection,
 * query parameter overrides, and reduced-motion accessibility.
 */

export const THEMES = Object.freeze({
  MINIMAL: 'minimal',
  GAMING: 'gaming',
  CREATOR: 'creator'
});

export const THEME_DEFAULTS = Object.freeze({
  [THEMES.MINIMAL]: {
    name: 'minimal',
    labelZh: '極簡俐落',
    labelEn: 'Minimal',
    fontFamily: "'Inter', 'Noto Sans TC', system-ui, -apple-system, sans-serif",
    fg: '#ffffff',
    bg: 'rgba(11, 17, 32, 0.85)',
    bar: '#10b981',
    barLight: '#34d399',
    accent: '#10b981',
    borderRadius: '16px',
    borderStyle: '1px solid rgba(255, 255, 255, 0.12)',
    boxShadow: '0 8px 30px rgba(0, 0, 0, 0.35)',
    glowIntensity: '0 0 12px rgba(16, 185, 129, 0.4)'
  },
  [THEMES.GAMING]: {
    name: 'gaming',
    labelZh: '電競霓虹',
    labelEn: 'Gaming Neon',
    fontFamily: "'Orbitron', 'Rajdhani', 'Noto Sans TC', system-ui, sans-serif",
    fg: '#ffffff',
    bg: 'rgba(10, 15, 30, 0.92)',
    bar: '#06b6d4',
    barLight: '#38bdf8',
    accent: '#f43f5e',
    borderRadius: '8px',
    borderStyle: '1px solid rgba(6, 182, 212, 0.4)',
    boxShadow: '0 0 25px rgba(6, 182, 212, 0.3), inset 0 0 15px rgba(6, 182, 212, 0.15)',
    glowIntensity: '0 0 20px rgba(6, 182, 212, 0.75)'
  },
  [THEMES.CREATOR]: {
    name: 'creator',
    labelZh: '柔和創作者',
    labelEn: 'Creator Soft',
    fontFamily: "'Outfit', 'Plus Jakarta Sans', 'Noto Sans TC', system-ui, sans-serif",
    fg: '#ffffff',
    bg: 'rgba(30, 27, 75, 0.82)',
    bar: '#8b5cf6',
    barLight: '#a78bfa',
    accent: '#fb7185',
    borderRadius: '24px',
    borderStyle: '1px solid rgba(255, 255, 255, 0.18)',
    boxShadow: '0 12px 36px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.25)',
    glowIntensity: '0 0 16px rgba(139, 92, 246, 0.5)'
  }
});

const HEX_COLOR_REGEX = /^(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export class ThemeManager {
  constructor(initialTheme = THEMES.MINIMAL) {
    this.currentTheme = this.validateThemeName(initialTheme);
    this.colorOverrides = {};
    this.settings = {};
  }

  validateThemeName(name) {
    const norm = String(name || '').trim().toLowerCase();
    if (norm === THEMES.GAMING || norm === 'neon') return THEMES.GAMING;
    if (norm === THEMES.CREATOR || norm === 'soft') return THEMES.CREATOR;
    return THEMES.MINIMAL;
  }

  setTheme(themeName) {
    this.currentTheme = this.validateThemeName(themeName);
    this.applyToDocument();
  }

  getTheme() {
    return this.currentTheme;
  }

  getThemeConfig() {
    const base = THEME_DEFAULTS[this.currentTheme] || THEME_DEFAULTS[THEMES.MINIMAL];
    return {
      ...base,
      ...this.colorOverrides
    };
  }

  setColorOverrides(overrides = {}) {
    this.colorOverrides = {};
    if (overrides.fg) this.colorOverrides.fg = overrides.fg;
    if (overrides.bg) this.colorOverrides.bg = overrides.bg;
    if (overrides.bar) {
      this.colorOverrides.bar = overrides.bar;
      if (!overrides.barLight) this.colorOverrides.barLight = overrides.bar;
    }
    if (overrides.barLight) this.colorOverrides.barLight = overrides.barLight;
    if (overrides.accent) this.colorOverrides.accent = overrides.accent;
    this.applyToDocument();
  }

  parseUrlParams(search = '') {
    if (typeof window === 'undefined' && !search) return;
    const searchString = search || (window.location ? window.location.search : '');
    const params = new URLSearchParams(searchString);

    if (params.has('theme')) {
      this.currentTheme = this.validateThemeName(params.get('theme'));
    }

    const overrides = {};
    ['fg', 'bg', 'bar', 'bar_light', 'accent'].forEach(key => {
      const val = params.get(key);
      if (val) {
        const clean = val.replace(/^#/, '');
        if (HEX_COLOR_REGEX.test(clean)) {
          const propKey = key === 'bar_light' ? 'barLight' : key;
          overrides[propKey] = `#${clean}`;
        }
      }
    });

    if (Object.keys(overrides).length > 0) {
      this.setColorOverrides(overrides);
    } else {
      this.applyToDocument();
    }
  }

  isReducedMotion() {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
  }

  applyToDocument(target = null) {
    if (typeof document === 'undefined') return;

    const el = target || document.documentElement;
    const config = this.getThemeConfig();

    // Set theme class
    el.classList.remove('theme-minimal', 'theme-gaming', 'theme-creator');
    el.classList.add(`theme-${this.currentTheme}`);

    // Set CSS variables
    el.style.setProperty('--fg', config.fg);
    el.style.setProperty('--bg', config.bg);
    el.style.setProperty('--bar', config.bar);
    el.style.setProperty('--bar-light', config.barLight || config.bar);
    el.style.setProperty('--accent', config.accent);
    el.style.setProperty('--border-radius', config.borderRadius);
    el.style.setProperty('--border-style', config.borderStyle);
    el.style.setProperty('--box-shadow', config.boxShadow);
    el.style.setProperty('--glow', config.glowIntensity);
  }
}

export default ThemeManager;
