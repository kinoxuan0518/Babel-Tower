/**
 * Unit tests for currency parser
 */

import { extractPrice } from '../../src/content/parsers/price';

describe('Currency Parser', () => {
  describe('extractPrice', () => {
    it('should extract USD price', () => {
      expect(extractPrice('$10.99')).toEqual({
        amount: 10.99,
        currency: 'USD'
      });
    });

    it('should extract EUR price', () => {
      expect(extractPrice('€25.50')).toEqual({
        amount: 25.50,
        currency: 'EUR'
      });
    });

    it('should extract CNY price', () => {
      expect(extractPrice('¥100')).toEqual({
        amount: 100,
        currency: 'CNY'
      });
    });

    it('should extract GBP price', () => {
      expect(extractPrice('£15.99')).toEqual({
        amount: 15.99,
        currency: 'GBP'
      });
    });

    it('should extract JPY price', () => {
      expect(extractPrice('¥1,500')).toEqual({
        amount: 1500,
        currency: 'JPY'
      });
    });

    it('should extract KRW price', () => {
      expect(extractPrice('₩25,000')).toEqual({
        amount: 25000,
        currency: 'KRW'
      });
    });

    it('should extract price with currency code', () => {
      expect(extractPrice('USD 19.99')).toEqual({
        amount: 19.99,
        currency: 'USD'
      });
    });

    it('should return null for no price', () => {
      expect(extractPrice('no price here')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(extractPrice('')).toBeNull();
    });
  });
});
