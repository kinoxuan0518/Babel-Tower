/**
 * Babel Tower - State Manager
 * Centralized state management with caching
 */

import { STORAGE_KEYS, FALLBACK_FX_TO_CNY } from '../../shared/constants.js';
import { logger } from '../../shared/utils.js';

// In-memory state cache
let state = {
  profile: null,
  fxToCNY: { ...FALLBACK_FX_TO_CNY },
  targetCurrency: 'CNY',
  customAnchorUnit: null,
  explainEnabled: true,
  explainLang: 'zh',
  llmConfig: null,
  userPhysical: null,
  llmPrefer: true,
  quietMode: true,
  showTranslation: true,
  translationLang: 'zh',
  pageContext: null,
  pageIntent: null,
  initialized: false
};

/**
 * Get current state (read-only)
 * @returns {Object}
 */
export function getState() {
  return { ...state };
}

/**
 * Update state partially
 * @param {Object} updates Partial state updates
 */
export function updateState(updates) {
  state = { ...state, ...updates };
}

/**
 * Load profile from extension resources
 */
export async function loadProfile() {
  try {
    const url = chrome.runtime.getURL('profile.json');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const profile = await res.json();
    updateState({ profile });
    logger.info('Profile loaded');
    return profile;
  } catch (err) {
    logger.error('Failed to load profile.json', err);
    return null;
  }
}

/**
 * Load all settings from chrome.storage.local
 */
export async function loadSettings() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get([
        STORAGE_KEYS.FX_TO_CNY,
        STORAGE_KEYS.TARGET_CURRENCY,
        STORAGE_KEYS.ANCHOR_UNIT,
        STORAGE_KEYS.EXPLAIN_ENABLED,
        STORAGE_KEYS.EXPLAIN_LANG,
        STORAGE_KEYS.LLM_CONFIG,
        STORAGE_KEYS.USER_PHYSICAL,
        STORAGE_KEYS.LLM_PREFER,
        STORAGE_KEYS.QUIET_MODE,
        STORAGE_KEYS.SHOW_TRANSLATION,
        STORAGE_KEYS.TRANSLATION_LANG
      ], (res) => {
        if (res) {
          if (res[STORAGE_KEYS.FX_TO_CNY]) {
            updateState({ fxToCNY: { ...FALLBACK_FX_TO_CNY, ...res[STORAGE_KEYS.FX_TO_CNY] } });
          }
          if (res[STORAGE_KEYS.TARGET_CURRENCY]) {
            updateState({ targetCurrency: String(res[STORAGE_KEYS.TARGET_CURRENCY]).toUpperCase() });
          }
          if (res[STORAGE_KEYS.ANCHOR_UNIT]) {
            updateState({ customAnchorUnit: res[STORAGE_KEYS.ANCHOR_UNIT] });
          }
          if (typeof res[STORAGE_KEYS.EXPLAIN_ENABLED] === 'boolean') {
            updateState({ explainEnabled: res[STORAGE_KEYS.EXPLAIN_ENABLED] });
          }
          if (res[STORAGE_KEYS.EXPLAIN_LANG]) {
            updateState({ explainLang: String(res[STORAGE_KEYS.EXPLAIN_LANG]) });
          }
          if (res[STORAGE_KEYS.LLM_CONFIG]) {
            updateState({ llmConfig: res[STORAGE_KEYS.LLM_CONFIG] });
          }
          if (res[STORAGE_KEYS.USER_PHYSICAL]) {
            updateState({ userPhysical: res[STORAGE_KEYS.USER_PHYSICAL] });
          }
          if (typeof res[STORAGE_KEYS.LLM_PREFER] === 'boolean') {
            updateState({ llmPrefer: res[STORAGE_KEYS.LLM_PREFER] });
          }
          if (typeof res[STORAGE_KEYS.QUIET_MODE] === 'boolean') {
            updateState({ quietMode: res[STORAGE_KEYS.QUIET_MODE] });
          }
          if (typeof res[STORAGE_KEYS.SHOW_TRANSLATION] === 'boolean') {
            updateState({ showTranslation: res[STORAGE_KEYS.SHOW_TRANSLATION] });
          }
          if (res[STORAGE_KEYS.TRANSLATION_LANG]) {
            updateState({ translationLang: String(res[STORAGE_KEYS.TRANSLATION_LANG]) });
          }
        }
        updateState({ initialized: true });
        logger.info('Settings loaded from storage');
        resolve(getState());
      });
    } catch (e) {
      logger.error('Failed to load settings', e);
      updateState({ initialized: true });
      resolve(getState());
    }
  });
}

/**
 * Setup storage change listener for real-time updates
 */
export function setupStorageListener() {
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      
      if (changes[STORAGE_KEYS.FX_TO_CNY]) {
        const newFx = changes[STORAGE_KEYS.FX_TO_CNY].newValue || {};
        updateState({ fxToCNY: { ...FALLBACK_FX_TO_CNY, ...newFx } });
        logger.debug('FX updated via storage change');
      }
      
      if (changes[STORAGE_KEYS.TARGET_CURRENCY]) {
        updateState({ targetCurrency: (changes[STORAGE_KEYS.TARGET_CURRENCY].newValue || 'CNY').toUpperCase() });
      }
      
      if (changes[STORAGE_KEYS.ANCHOR_UNIT]) {
        updateState({ customAnchorUnit: changes[STORAGE_KEYS.ANCHOR_UNIT].newValue || null });
      }
      
      if (changes[STORAGE_KEYS.EXPLAIN_ENABLED]) {
        updateState({ explainEnabled: !!changes[STORAGE_KEYS.EXPLAIN_ENABLED].newValue });
      }
      
      if (changes[STORAGE_KEYS.EXPLAIN_LANG]) {
        updateState({ explainLang: String(changes[STORAGE_KEYS.EXPLAIN_LANG].newValue || 'zh') });
      }
      
      if (changes[STORAGE_KEYS.LLM_CONFIG]) {
        updateState({ llmConfig: changes[STORAGE_KEYS.LLM_CONFIG].newValue || null });
      }
      
      if (changes[STORAGE_KEYS.USER_PHYSICAL]) {
        updateState({ userPhysical: changes[STORAGE_KEYS.USER_PHYSICAL].newValue || null });
      }
      
      if (changes[STORAGE_KEYS.LLM_PREFER]) {
        updateState({ llmPrefer: !!changes[STORAGE_KEYS.LLM_PREFER].newValue });
      }
      
      if (changes[STORAGE_KEYS.QUIET_MODE]) {
        updateState({ quietMode: !!changes[STORAGE_KEYS.QUIET_MODE].newValue });
      }
      
      if (changes[STORAGE_KEYS.SHOW_TRANSLATION]) {
        updateState({ showTranslation: !!changes[STORAGE_KEYS.SHOW_TRANSLATION].newValue });
      }
      
      if (changes[STORAGE_KEYS.TRANSLATION_LANG]) {
        updateState({ translationLang: String(changes[STORAGE_KEYS.TRANSLATION_LANG].newValue || 'zh') });
      }
    });
    
    logger.debug('Storage listener setup complete');
  } catch (e) {
    logger.error('Failed to setup storage listener', e);
  }
}

/**
 * Initialize state (call once on content script load)
 */
export async function initializeState() {
  if (state.initialized) return getState();
  
  await loadProfile();
  await loadSettings();
  setupStorageListener();
  
  return getState();
}
