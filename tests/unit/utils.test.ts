/**
 * @jest-environment jsdom
 */

import { debounce, escapeHTML, SimpleCache, normalizeCurrency, formatHalf, safeJSONParse, extractJSON } from '../../src/shared/utils';

describe('Shared Utils', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('debounce', () => {
    it('should delay function execution', () => {
      const mockFn = jest.fn();
      const debouncedFn = debounce(mockFn, 100);

      debouncedFn();
      expect(mockFn).not.toHaveBeenCalled();

      jest.advanceTimersByTime(100);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should cancel previous calls', () => {
      const mockFn = jest.fn();
      const debouncedFn = debounce(mockFn, 100);

      debouncedFn();
      debouncedFn();
      debouncedFn();

      jest.advanceTimersByTime(100);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('escapeHTML', () => {
    it('should escape HTML entities', () => {
      expect(escapeHTML('<script>alert("xss")</script>'))
        .toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });

    it('should handle special characters', () => {
      expect(escapeHTML('&<>\"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
    });

    it('should handle non-string input', () => {
      expect(escapeHTML(123)).toBe('123');
    });
  });

  describe('SimpleCache', () => {
    it('should store and retrieve values', () => {
      const cache = new SimpleCache(1000);
      cache.set('key', 'value');
      expect(cache.get('key')).toBe('value');
    });

    it('should return null for missing keys', () => {
      const cache = new SimpleCache(1000);
      expect(cache.get('missing')).toBeNull();
    });

    it('should expire old entries', () => {
      const cache = new SimpleCache(100);
      cache.set('key', 'value');
      
      jest.advanceTimersByTime(150);
      expect(cache.get('key')).toBeNull();
    });

    it('should check existence with has()', () => {
      const cache = new SimpleCache(1000);
      cache.set('key', 'value');
      expect(cache.has('key')).toBe(true);
      expect(cache.has('missing')).toBe(false);
    });

    it('should prune to max size', () => {
      const cache = new SimpleCache(1000);
      for (let i = 0; i < 150; i++) {
        cache.set(`key${i}`, `value${i}`);
      }
      cache.prune(100);
      expect(cache['cache'].size).toBeLessThanOrEqual(100);
    });
  });

  describe('normalizeCurrency', () => {
    it('should normalize RMB to CNY', () => {
      expect(normalizeCurrency('rmb')).toBe('CNY');
      expect(normalizeCurrency('RMB')).toBe('CNY');
    });

    it('should keep other currencies unchanged', () => {
      expect(normalizeCurrency('USD')).toBe('USD');
      expect(normalizeCurrency('eur')).toBe('EUR');
    });

    it('should handle empty input', () => {
      expect(normalizeCurrency('')).toBe('CNY');
    });
  });

  describe('formatHalf', () => {
    it('should format whole numbers', () => {
      expect(formatHalf(10)).toBe('10');
      expect(formatHalf(10.0)).toBe('10');
    });

    it('should format half numbers', () => {
      expect(formatHalf(10.5)).toBe('10.5');
      expect(formatHalf(9.5)).toBe('9.5');
    });

    it('should round to nearest half', () => {
      expect(formatHalf(10.25)).toBe('10.5');
      expect(formatHalf(10.75)).toBe('11');
    });
  });

  describe('safeJSONParse', () => {
    it('should parse valid JSON', () => {
      expect(safeJSONParse('{"key": "value"}')).toEqual({ key: 'value' });
    });

    it('should return fallback for invalid JSON', () => {
      expect(safeJSONParse('invalid', null)).toBeNull();
      expect(safeJSONParse('invalid', { default: true })).toEqual({ default: true });
    });

    it('should handle null input', () => {
      expect(safeJSONParse(null, null)).toBeNull();
    });
  });

  describe('extractJSON', () => {
    it('should extract JSON from plain text', () => {
      const text = 'Some text {\"key\": \"value\"} more text';
      expect(extractJSON(text)).toEqual({ key: 'value' });
    });

    it('should extract JSON from markdown code blocks', () => {
      const text = '```json\n{\"key\": \"value\"}\n```';
      expect(extractJSON(text)).toEqual({ key: 'value' });
    });

    it('should return null for no JSON', () => {
      expect(extractJSON('no json here')).toBeNull();
    });

    it('should handle null input', () => {
      expect(extractJSON(null)).toBeNull();
    });
  });
});
