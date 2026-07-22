/**
 * Babel Tower - Shared Constants
 * Centralized configuration values to eliminate magic numbers
 */

// Supported Languages
export const SUPPORTED_LANGUAGES = [
  { code: 'zh_CN', name: '简体中文' },
  { code: 'en', name: 'English' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' }
];

// Storage Keys
export const STORAGE_KEYS = {
  UI_LANG: 'bt_ui_lang',
  FX_TO_CNY: 'fxToCNY',
  FX_LAST_UPDATED: 'fx_lastUpdated',
  FX_SOURCE: 'fx_source',
  FX_FETCHING: 'fx_fetching',
  FX_FETCH_ERROR: 'fx_fetch_error',
  TARGET_CURRENCY: 'bt_targetCurrency',
  ANCHOR_UNIT: 'bt_anchor_unit',
  EXPLAIN_ENABLED: 'bt_explain_enabled',
  EXPLAIN_LANG: 'bt_explain_lang',
  LLM_CONFIG: 'bt_llm',
  USER_PHYSICAL: 'bt_user_physical',
  LLM_PREFER: 'bt_llm_prefer',
  QUIET_MODE: 'bt_quiet_mode',
  SHOW_TRANSLATION: 'bt_show_translation',
  TRANSLATION_LANG: 'bt_translation_lang',
  PAGE_INTENT_CACHE: 'bt_page_intent_cache',
  LLM_RESPONSE_CACHE: 'bt_llm_cache'
};

// Message Types (Content <-> Background communication)
export const MSG_TYPES = {
  REFRESH_FX: 'bt_refresh_fx',
  FX_STATUS: 'bt_fx_status',
  TEST_LLM: 'bt_test_llm',
  LIST_MODELS: 'bt_list_models',
  CALL_LLM: 'bt_call_llm',
  OPEN_OPTIONS: 'bt_open_options',
  ANALYZE_SELECTION: 'bt_analyze_selection'
};

// Supported Currencies
export const CURRENCIES = [
  'CNY', 'USD', 'EUR', 'GBP', 'JPY', 'KRW', 'HKD', 'TWD', 'SGD', 'AUD', 'NZD', 'CAD',
  'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'TRY', 'RUB', 'INR', 'IDR', 'MYR',
  'THB', 'VND', 'PHP', 'BRL', 'MXN', 'ZAR', 'AED', 'SAR', 'QAR', 'OMR', 'BHD', 'KWD',
  'ILS', 'UAH', 'RON', 'BGN', 'GEL', 'AMD', 'AZN', 'KZT', 'ARS', 'CLP', 'COP', 'PEN',
  'UYU', 'DOP', 'CRC', 'GTQ', 'PYG', 'VES', 'BOB', 'NGN', 'EGP', 'MAD', 'NPR', 'LKR',
  'PKR', 'BDT', 'GHS', 'LAK', 'MNT', 'BAM', 'RSD', 'MKD', 'HRK', 'ALL', 'DZD', 'TND',
  'LYD', 'LBP', 'YER', 'IRR'
];

// Fallback FX rates (used when offline)
export const FALLBACK_FX_TO_CNY = {
  CNY: 1, USD: 7.2, EUR: 7.8, GBP: 9.2, JPY: 0.05, KRW: 0.0053, HKD: 0.92, TWD: 0.23,
  SGD: 5.3, AUD: 4.7, NZD: 4.3, CAD: 5.2, CHF: 8.3, SEK: 0.7, NOK: 0.66, DKK: 1.05,
  PLN: 1.9, CZK: 0.31, HUF: 0.02, TRY: 0.23, RUB: 0.08, INR: 0.086, IDR: 0.00046,
  MYR: 1.5, THB: 0.20, VND: 0.00029, PHP: 0.13, BRL: 1.4, MXN: 0.42, ZAR: 0.38,
  AED: 1.96, SAR: 1.92, QAR: 1.98, OMR: 18.7, BHD: 19.1, KWD: 23.3, ILS: 1.93,
  UAH: 0.18, RON: 1.57, BGN: 3.99, GEL: 2.62, AMD: 0.019, AZN: 4.24, KZT: 0.016
};

// Cognitive Anchors (Default benchmarks for comparisons)
export const COGNITIVE_ANCHORS = {
  lunch: { name: '午餐', costCNY: 30 },
  coffee: { name: '咖啡', costCNY: 15 },
  milkTea: { name: '奶茶', costCNY: 20 },
  uniqloTee: { name: '优衣库T恤', costCNY: 79 },
  switchGame: { name: 'Switch游戏', costCNY: 350 },
  netflix: { name: '订阅', costCNY: 25 }
};

// PPP (Purchasing Power Parity) Coefficients
export const PPP_TABLE = {
  CNY: 1.0, USD: 1.6, GBP: 1.4, EUR: 1.3, JPY: 0.9, KRW: 1.1, HKD: 1.4,
  THB: 0.6, VND: 0.4, PHP: 0.5, RUB: 0.7, TRY: 0.6, CHF: 2.2, NOK: 1.8
};

// LLM Provider Presets
export const LLM_PRESETS = {
  openai: {
    name: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini'
  },
  deepseek: {
    name: 'DeepSeek',
    endpoint: 'https://api.deepseek.com/chat/completions',
    model: 'deepseek-chat'
  },
  moonshot: {
    name: 'Moonshot',
    endpoint: 'https://api.moonshot.cn/v1/chat/completions',
    model: 'moonshot-v1-8k'
  },
  groq: {
    name: 'Groq',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.1-70b-versatile'
  },
  together: {
    name: 'Together',
    endpoint: 'https://api.together.xyz/v1/chat/completions',
    model: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo'
  },
  gemini: {
    name: 'Google Gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
    model: 'gemini-pro'
  },
  custom: { name: '自定义', endpoint: '', model: '' }
};

// Timing Constants
export const TIMING = {
  FX_REFRESH_MINUTES: 240, // 4 hours
  FX_FETCH_TIMEOUT_MS: 8000,
  LLM_TIMEOUT_MS: 15000,
  DEBOUNCE_SELECTION_MS: 120,
  CACHE_TTL_MS: 24 * 60 * 60 * 1000, // 24 hours
  PAGE_INTENT_CACHE_MAX: 50
};
