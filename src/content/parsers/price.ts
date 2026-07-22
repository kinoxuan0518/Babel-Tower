/**
 * Babel Tower - Price Parser
 * Extracts price information from text with precompiled regex
 */

import { mapTokenToCurrency, resolveAmbiguousToken } from './currency';
import { normalizeCurrency } from '../../shared/utils';

// Precompiled regex patterns for performance
const NUM_PATTERN = '(?<num>(?:[0-9]{1,3}(?:[\\s.,\'][0-9]{3})+|[0-9]+)(?:[.,][0-9]{1,2})?|[0-9]+(?:,-)?)';

const TOKEN_PARTS = [
  // Prefixed $ variants
  'US\\$', 'CA\\$', 'AU\\$', 'NZ\\$', 'HK\\$', 'NT\\$', 'S\\$', 'SG\\$', 'MX\\$', 'AR\\$', 'R\\$', 'C\\$', 'U\\$S',
  // Unique symbols
  '€', '£', '¥', '₩', '₫', '฿', '₱', '₽', '₺', '₪', '₴', '₦', '₹', '₵', '₭', '₮', '₼', '₾', '֏', '₸', '₡', 'Q',
  // Local abbreviations
  'zł', 'Kč', 'kr', 'Ft', 'lei', 'лв', 'ден', 'KM', 'Fr\\.?', 'S/\\.?', 'Bs\\.?', 'Dh', 'KSh', 'TSh', 'USh', 'Rs\\.?', 'RM', 'MT', 'Lek',
  // ISO codes
  'USD', 'EUR', 'GBP', 'CNY', 'RMB', 'JPY', 'KRW', 'HKD', 'TWD', 'SGD', 'AUD', 'NZD', 'CAD', 'CHF', 'SEK', 'NOK', 'DKK',
  'PLN', 'CZK', 'HUF', 'TRY', 'RUB', 'INR', 'IDR', 'MYR', 'THB', 'VND', 'PHP', 'BRL', 'MXN', 'ZAR', 'AED', 'SAR', 'QAR',
  'OMR', 'BHD', 'KWD', 'ILS', 'UAH', 'RON', 'BGN', 'GEL', 'AMD', 'AZN', 'KZT', 'ARS', 'CLP', 'COP', 'PEN', 'UYU', 'DOP',
  'CRC', 'GTQ', 'PYG', 'VES', 'BOB', 'NGN', 'EGP', 'MAD', 'NPR', 'LKR', 'PKR', 'BDT', 'GHS', 'LAK', 'MNT', 'BAM', 'RSD',
  'MKD', 'HRK', 'ALL', 'DZD', 'TND', 'LYD', 'LBP', 'YER', 'IRR'
].join('|');

// Precompiled regex (created once at module load)
const TOKEN_BEFORE_RE = new RegExp(`(?<tok>${TOKEN_PARTS})\\s*${NUM_PATTERN}`, 'iu');
const TOKEN_AFTER_RE = new RegExp(`${NUM_PATTERN}\\s*(?<tok>${TOKEN_PARTS})`, 'iu');

/**
 * Parse localized number string to float
 * Handles: 1,234.56 / 1.234,56 / 1 234,56 / 199,- / 19.99
 * @param {string} numText Number string
 * @returns {number} Parsed number or NaN
 */
export function parseLocalizedNumber(numText) {
  let s = String(numText).trim();
  
  // Remove trailing currency-style "-,"
  s = s.replace(/,-$/, '');
  
  const hasDot = s.includes('.');
  const hasComma = s.includes(',');
  const original = s;
  
  // Remove thousand separators (space, apostrophe, NBSP)
  s = s.replace(/[\s'\u00A0]/g, '');
  
  if (hasDot && hasComma) {
    // Determine decimal separator by last occurrence
    const lastComma = original.lastIndexOf(',');
    const lastDot = original.lastIndexOf('.');
    const decimalChar = lastComma > lastDot ? ',' : '.';
    const thousandsChar = decimalChar === ',' ? '.' : ',';
    
    s = s.replace(new RegExp(`\\${thousandsChar}`, 'g'), '');
    s = s.replace(decimalChar, '.');
  } else if (hasComma) {
    // If comma followed by 1-2 digits, treat as decimal
    const parts = s.split(',');
    if (parts.length === 2 && parts[1].length > 0 && parts[1].length <= 2) {
      s = parts[0].replace(/\./g, '') + '.' + parts[1];
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasDot) {
    // If dot followed by 1-2 digits, treat as decimal
    const parts = s.split('.');
    if (parts.length === 2 && parts[1].length > 0 && parts[1].length <= 2) {
      s = parts[0].replace(/,/g, '') + '.' + parts[1];
    } else {
      s = s.replace(/\./g, '');
    }
  }
  
  const val = parseFloat(s);
  return Number.isFinite(val) ? val : NaN;
}

/**
 * Extract price from text
 * @param {string} text Input text
 * @returns {{ amount: number, currency: string } | null} Extracted price or null
 */
export function extractPrice(text) {
  // Normalize NBSP and trim
  const s = String(text).replace(/\u00A0/g, ' ').trim();
  
  // Try both patterns
  const match = s.match(TOKEN_BEFORE_RE) || s.match(TOKEN_AFTER_RE);
  if (!match) return null;
  
  const groups = match.groups || {};
  const token = groups.tok;
  const numText = groups.num;
  
  const amount = parseLocalizedNumber(numText);
  if (!Number.isFinite(amount)) return null;
  
  let currency = mapTokenToCurrency(token);
  
  // Resolve ambiguous tokens
  if (!currency || currency === 'AMBIGUOUS') {
    currency = resolveAmbiguousToken(token) || 'USD';
  }
  
  // Normalize RMB -> CNY
  currency = normalizeCurrency(currency);
  
  return { amount, currency };
}
