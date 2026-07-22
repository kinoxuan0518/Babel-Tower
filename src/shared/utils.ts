/**
 * Babel Tower - Utility Functions
 * Common helper functions used across modules
 */

/**
 * Debounce function execution
 * @param {Function} fn Function to debounce
 * @param {number} ms Delay in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(fn, ms) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

/**
 * Escape HTML to prevent XSS
 * @param {string} str Input string
 * @returns {string} Escaped string
 */
export function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Simple in-memory cache with TTL
 */
export class SimpleCache {
  private cache: Map<string, { data: any; timestamp: number }>;
  private ttl: number;

  constructor(ttlMs = 24 * 60 * 60 * 1000) {
    this.cache = new Map();
    this.ttl = ttlMs;
  }

  get(key: string) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  set(key: string, data: any) {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  has(key: string) {
    return this.get(key) !== null;
  }

  clear() {
    this.cache.clear();
  }

  // Limit cache size
  prune(maxSize = 100) {
    if (this.cache.size <= maxSize) return;
    const entries = [...this.cache.entries()]
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = entries.slice(0, entries.length - maxSize);
    toRemove.forEach(([key]) => this.cache.delete(key));
  }
}

/**
 * Normalize currency code (e.g., RMB -> CNY)
 * @param {string} code Currency code
 * @returns {string} Normalized code
 */
export function normalizeCurrency(code) {
  const upper = (code || '').toUpperCase().trim();
  if (!upper) return 'CNY';
  return upper === 'RMB' ? 'CNY' : upper;
}

/**
 * Format number to half-precision (for shoe sizes)
 * @param {number} x Number to format
 * @returns {string} Formatted string
 */
export function formatHalf(x) {
  const r = Math.round(x * 2) / 2;
  return Math.abs(r - Math.round(r)) < 1e-6 ? String(Math.round(r)) : r.toFixed(1);
}

/**
 * Safe JSON parse with fallback
 * @param {string} str JSON string
 * @param {*} fallback Fallback value
 * @returns {*} Parsed value or fallback
 */
export function safeJSONParse(str, fallback = null) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

/**
 * Extract JSON from text (handles markdown code blocks)
 * @param {string} text Text potentially containing JSON
 * @returns {Object|null} Parsed JSON or null
 */
export function extractJSON(text) {
  if (!text) return null;
  
  // Remove markdown code blocks
  let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
  
  // Try direct parse
  const direct = safeJSONParse(cleaned);
  if (direct) return direct;
  
  // Try regex extraction
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    return safeJSONParse(match[0]);
  }
  
  return null;
}

/**
 * Create a cancellable fetch with timeout
 * @param {string} url URL to fetch
 * @param {RequestInit} options Fetch options
 * @param {number} timeoutMs Timeout in milliseconds
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timer);
    return response;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/**
 * Logger with levels
 */
export const logger = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  
  level: 1, // Default to INFO
  
  debug(...args) {
    if (this.level <= this.DEBUG) console.debug('[BT:DEBUG]', ...args);
  },
  
  info(...args) {
    if (this.level <= this.INFO) console.log('[BT:INFO]', ...args);
  },
  
  warn(...args) {
    if (this.level <= this.WARN) console.warn('[BT:WARN]', ...args);
  },
  
  error(...args) {
    if (this.level <= this.ERROR) console.error('[BT:ERROR]', ...args);
  }
};
