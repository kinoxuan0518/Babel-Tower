/**
 * Babel Tower - Currency Parser
 * Maps currency tokens to ISO codes with precompiled regex
 */

// Direct ISO code mappings
const DIRECT_CODES = {
  USD: 'USD', EUR: 'EUR', GBP: 'GBP', CNY: 'CNY', RMB: 'CNY', JPY: 'JPY', KRW: 'KRW',
  HKD: 'HKD', TWD: 'TWD', SGD: 'SGD', AUD: 'AUD', NZD: 'NZD', CAD: 'CAD', CHF: 'CHF',
  SEK: 'SEK', NOK: 'NOK', DKK: 'DKK', PLN: 'PLN', CZK: 'CZK', HUF: 'HUF', TRY: 'TRY',
  RUB: 'RUB', INR: 'INR', IDR: 'IDR', MYR: 'MYR', THB: 'THB', VND: 'VND', PHP: 'PHP',
  BRL: 'BRL', MXN: 'MXN', ZAR: 'ZAR', AED: 'AED', SAR: 'SAR', QAR: 'QAR', OMR: 'OMR',
  BHD: 'BHD', KWD: 'KWD', ILS: 'ILS', UAH: 'UAH', RON: 'RON', BGN: 'BGN', GEL: 'GEL',
  AMD: 'AMD', AZN: 'AZN', KZT: 'KZT', ARS: 'ARS', CLP: 'CLP', COP: 'COP', PEN: 'PEN',
  UYU: 'UYU', DOP: 'DOP', CRC: 'CRC', GTQ: 'GTQ', PYG: 'PYG', VES: 'VES', BOB: 'BOB',
  NGN: 'NGN', EGP: 'EGP', MAD: 'MAD', NPR: 'NPR', LKR: 'LKR', PKR: 'PKR', BDT: 'BDT',
  GHS: 'GHS', LAK: 'LAK', MNT: 'MNT', BAM: 'BAM', RSD: 'RSD', MKD: 'MKD', HRK: 'HRK',
  ALL: 'ALL', DZD: 'DZD', TND: 'TND', LYD: 'LYD', LBP: 'LBP', YER: 'YER', IRR: 'IRR'
};

// Prefix-based currency symbols
const PREFIX_MAP = {
  'HK$': 'HKD', 'NT$': 'TWD', 'S$': 'SGD', 'SG$': 'SGD', 'A$': 'AUD', 'AU$': 'AUD',
  'C$': 'CAD', 'CA$': 'CAD', 'NZ$': 'NZD', 'R$': 'BRL', 'MX$': 'MXN', 'AR$': 'ARS',
  'US$': 'USD', 'U$S': 'UYU', 'S/.': 'PEN', 'S/': 'PEN', 'RD$': 'DOP', 'BS.': 'VES',
  'BS': 'VES', 'KSH': 'KES', 'TSH': 'TZS', 'USH': 'UGX', 'Q': 'GTQ', 'Q.': 'GTQ'
};

// Unique currency symbols
const SYMBOL_MAP = {
  '€': 'EUR', '£': 'GBP', '₹': 'INR', '₩': 'KRW', '₫': 'VND', '฿': 'THB',
  '₱': 'PHP', '₽': 'RUB', '₺': 'TRY', '₪': 'ILS', '₴': 'UAH', '₦': 'NGN',
  '₵': 'GHS', '₭': 'LAK', '₮': 'MNT', '₼': 'AZN', '₾': 'GEL', '֏': 'AMD',
  '₸': 'KZT', '₡': 'CRC'
};

// Text-based currency identifiers
const TEXT_MAP = {
  'zł': 'PLN', 'Kč': 'CZK', 'Ft': 'HUF', 'лв': 'BGN', 'ден': 'MKD',
  'KM': 'BAM', 'RM': 'MYR', 'MT': 'MZN', 'Lek': 'ALL'
};

// Ambiguous tokens that need context resolution
const AMBIGUOUS_TOKENS = new Set(['$', '¥', 'kr', 'Fr.', 'Fr', 'R', 'Rs.', 'Rs', 'lei', 'dh']);

/**
 * Map currency token to ISO code
 * @param {string} token Currency token
 * @returns {string|null} ISO code or 'AMBIGUOUS' or null
 */
export function mapTokenToCurrency(token) {
  if (!token) return null;
  
  const upper = token.toUpperCase();
  
  // Direct ISO codes
  if (DIRECT_CODES[upper]) return DIRECT_CODES[upper];
  
  // Prefix-based
  if (PREFIX_MAP[upper]) return PREFIX_MAP[upper];
  if (PREFIX_MAP[token]) return PREFIX_MAP[token];
  
  // Symbol-based
  if (SYMBOL_MAP[token]) return SYMBOL_MAP[token];
  
  // Text-based (case-sensitive)
  if (TEXT_MAP[token]) return TEXT_MAP[token];
  if (token.toLowerCase() === 'lei') return 'RON';
  if (token.toLowerCase() === 'dh') return 'MAD';
  
  // Ambiguous
  if (AMBIGUOUS_TOKENS.has(token) || AMBIGUOUS_TOKENS.has(token.toLowerCase())) {
    return 'AMBIGUOUS';
  }
  
  return null;
}

/**
 * Resolve ambiguous currency token based on page context
 * @param {string} token Ambiguous token
 * @returns {string|null} Resolved ISO code
 */
export function resolveAmbiguousToken(token) {
  const lang = (document.documentElement.lang || navigator.language || '').toLowerCase();
  const region = (lang.split('-')[1] || '').toUpperCase();
  const tld = (location.hostname.split('.').pop() || '').toUpperCase();
  
  // Yen: Japan vs China
  if (token === '¥') {
    if (region === 'JP' || lang.startsWith('ja') || tld === 'JP') return 'JPY';
    if (region === 'CN' || lang.startsWith('zh') || tld === 'CN') return 'CNY';
    return 'CNY'; // Default to CNY
  }
  
  // Dollar variants
  if (token === '$') {
    const dollarMap = {
      CA: 'CAD', AU: 'AUD', NZ: 'NZD', SG: 'SGD', HK: 'HKD',
      MX: 'MXN', AR: 'ARS', BR: 'BRL', UY: 'UYU'
    };
    return dollarMap[region] || dollarMap[tld] || 'USD';
  }
  
  // Rupee variants
  if (token === 'Rs' || token === 'Rs.' || token === '₨') {
    const rupeeMap = { PK: 'PKR', LK: 'LKR', NP: 'NPR' };
    return rupeeMap[region] || rupeeMap[tld] || 'INR';
  }
  
  // Nordic krona
  if (token.toLowerCase() === 'kr') {
    if (region === 'SE' || lang.startsWith('sv') || tld === 'SE') return 'SEK';
    if (region === 'NO' || lang.startsWith('no') || lang.startsWith('nb') || tld === 'NO') return 'NOK';
    if (region === 'DK' || lang.startsWith('da') || tld === 'DK') return 'DKK';
    return 'SEK';
  }
  
  // South African Rand
  if (token === 'R') {
    if (region === 'ZA' || tld === 'ZA') return 'ZAR';
  }
  
  // Swiss Franc / African Franc
  if (token === 'Fr.' || token === 'Fr') {
    if (tld === 'PF') return 'XPF';
    const xofTLD = ['SN', 'CI', 'BF', 'BJ', 'ML', 'NE', 'TG', 'GW'];
    const xafTLD = ['CM', 'GA', 'CG', 'TD', 'GQ', 'CF'];
    if (xofTLD.includes(tld)) return 'XOF';
    if (xafTLD.includes(tld)) return 'XAF';
    return 'CHF';
  }
  
  return null;
}
