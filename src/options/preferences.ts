/**
 * Babel Tower - Options Page: Preferences Module
 * Handles general preferences (explain toggle, translation, quiet mode)
 */

import { STORAGE_KEYS } from '../shared/constants';

/**
 * Initialize preference toggles
 * @param {Object} elements - DOM elements
 */
export async function initPreferences(elements) {
  const { 
    explainToggle, explainLang, 
    showTranslation, translationLang,
    quietMode 
  } = elements;
  
  const res = await chrome.storage.local.get([
    STORAGE_KEYS.EXPLAIN_ENABLED,
    STORAGE_KEYS.EXPLAIN_LANG,
    STORAGE_KEYS.SHOW_TRANSLATION,
    STORAGE_KEYS.TRANSLATION_LANG,
    STORAGE_KEYS.QUIET_MODE,
    STORAGE_KEYS.LLM_PREFER
  ]);
  
  explainToggle.checked = res[STORAGE_KEYS.EXPLAIN_ENABLED] !== false;
  explainLang.value = res[STORAGE_KEYS.EXPLAIN_LANG] || 'zh';
  showTranslation.checked = res[STORAGE_KEYS.SHOW_TRANSLATION] !== false;
  translationLang.value = res[STORAGE_KEYS.TRANSLATION_LANG] || res[STORAGE_KEYS.EXPLAIN_LANG] || 'zh';
  quietMode.checked = res[STORAGE_KEYS.QUIET_MODE] !== false;
}

/**
 * Save explain settings
 * @param {HTMLInputElement} explainToggle - Enable toggle
 * @param {HTMLSelectElement} explainLang - Language selector
 */
export function saveExplainSettings(explainToggle, explainLang) {
  chrome.storage.local.set({ 
    [STORAGE_KEYS.EXPLAIN_ENABLED]: explainToggle.checked,
    [STORAGE_KEYS.EXPLAIN_LANG]: explainLang.value
  });
}

/**
 * Save translation settings
 * @param {HTMLInputElement} showTranslation - Show toggle
 * @param {HTMLSelectElement} translationLang - Language selector
 */
export function saveTranslationSettings(showTranslation, translationLang) {
  chrome.storage.local.set({
    [STORAGE_KEYS.SHOW_TRANSLATION]: showTranslation.checked,
    [STORAGE_KEYS.TRANSLATION_LANG]: translationLang.value
  });
}

/**
 * Save quiet mode setting
 * @param {HTMLInputElement} quietMode - Quiet mode toggle
 */
export function saveQuietMode(quietMode) {
  chrome.storage.local.set({ 
    [STORAGE_KEYS.QUIET_MODE]: quietMode.checked 
  });
}

/**
 * Save LLM preference setting
 * @param {HTMLInputElement} llmPrefer - Prefer LLM toggle
 */
export function saveLlmPrefer(llmPrefer) {
  chrome.storage.local.set({ 
    [STORAGE_KEYS.LLM_PREFER]: llmPrefer.checked 
  });
}

/**
 * Validate language code
 * @param {string} langCode - Language code to validate
 * @returns {boolean} Whether the language code is valid
 */
export function isValidLanguageCode(langCode) {
  if (!langCode || typeof langCode !== 'string') return false;
  
  // Basic validation: should match pattern like 'en', 'zh_CN', etc.
  return /^[a-z]{2}(_[A-Z]{2})?$/.test(langCode.toLowerCase());
}
