/**
 * Babel Tower - Options Page: Language Management Module
 * Handles UI language selection and i18n functionality
 */

import { STORAGE_KEYS } from '../shared/constants.js';

/**
 * @typedef {Object} LanguageOption
 * @property {string} code - Language code (e.g., 'zh_CN', 'en')
 * @property {string} name - Display name in native script
 */

/**
 * Current language messages cache
 * @type {Object<string, {message: string}>}
 */
let currentMessages = {};

/**
 * Load language file dynamically
 * @param {string} langCode - Language code to load
 * @returns {Promise<Object>} Messages object
 */
export async function loadLanguageFile(langCode) {
  try {
    const url = chrome.runtime.getURL(`_locales/${langCode}/messages.json`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load ${langCode}`);
    return await res.json();
  } catch (err) {
    console.warn('[BT] Failed to load language file:', langCode, err);
    // Fallback to English
    if (langCode !== 'en') {
      return loadLanguageFile('en');
    }
    return {};
  }
}

/**
 * Apply i18n to all elements with data-i18n attribute
 */
export function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const msg = currentMessages[key]?.message;
    if (msg) el.textContent = msg;
  });
  
  // Update document title
  const titleMsg = currentMessages['optionsTitle']?.message;
  if (titleMsg) document.title = titleMsg;
}

/**
 * Get localized message with fallback
 * @param {string} key - Message key
 * @param {string} fallback - Fallback text
 * @returns {string} Localized message
 */
export function i18n(key, fallback = '') {
  return currentMessages[key]?.message || fallback;
}

/**
 * Switch language and apply immediately
 * @param {string} langCode - Target language code
 * @returns {Promise<void>}
 */
export async function switchLanguage(langCode) {
  currentMessages = await loadLanguageFile(langCode);
  applyI18n();
  
  // Save to storage
  await chrome.storage.local.set({ [STORAGE_KEYS.UI_LANG]: langCode });
}

/**
 * Initialize language settings
 * @param {HTMLSelectElement} uiLanguageSelect - Language selector element
 * @returns {Promise<string>} Current language code
 */
export async function initLanguage(uiLanguageSelect) {
  // Load saved language or detect from browser
  const stored = await chrome.storage.local.get([STORAGE_KEYS.UI_LANG]);
  let langCode = stored[STORAGE_KEYS.UI_LANG];
  
  if (!langCode) {
    // Detect from browser language
    const browserLang = chrome.i18n.getUILanguage();
    if (browserLang.startsWith('zh')) langCode = 'zh_CN';
    else if (browserLang.startsWith('ja')) langCode = 'ja';
    else if (browserLang.startsWith('ko')) langCode = 'ko';
    else langCode = 'en';
  }
  
  // Load language file and apply
  currentMessages = await loadLanguageFile(langCode);
  applyI18n();
  
  // Set current language in selector
  uiLanguageSelect.value = langCode;
  
  return langCode;
}

/**
 * Get current messages cache
 * @returns {Object} Current messages
 */
export function getCurrentMessages() {
  return currentMessages;
}
