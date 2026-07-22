/**
 * Babel Tower v3 - Options Page Script
 * Refactored: Modular architecture with separated concerns
 */

import { STORAGE_KEYS, MSG_TYPES } from '../shared/constants.js';
import { 
  loadLanguageFile, applyI18n, i18n, switchLanguage, initLanguage 
} from './language.js';
import { 
  renderCurrencyOptions, initCurrency, saveCurrency, resetCurrency, updateFxStatus, refreshFx 
} from './currency.js';
import { 
  detectProviderByEndpoint, applyPreset, setLlmInputsEnabled, initLlm, saveLlmConfig, 
  clearLlmConfig, testLlmConnection, listModels, handleLlmEnableToggle 
} from './llm-config.js';
import { initPhysical, savePhysical, clearPhysical } from './physical.js';
import { initAnchor, saveAnchor, clearAnchor } from './anchor.js';
import { initPreferences, saveExplainSettings, saveTranslationSettings, saveQuietMode, saveLlmPrefer } from './preferences.js';

const $ = (id) => document.getElementById(id);

async function init() {
  const uiLanguage = $('uiLanguage');
  const saveLangBtn = $('saveLangBtn');
  const sel = $('targetCurrency');
  const saveBtn = $('saveBtn');
  const resetBtn = $('resetBtn');
  const saveStatus = $('saveStatus');
  const refreshFxBtn = $('refreshFxBtn');
  const fxStatus = $('fxStatus');
  const explainToggle = $('explainToggle');
  const explainLang = $('explainLang');
  const physHeight = $('physHeight');
  const physWeight = $('physWeight');
  const physFoot = $('physFoot');
  const physFit = $('physFit');
  const savePhysBtn = $('savePhysBtn');
  const clearPhysBtn = $('clearPhysBtn');
  const physStatus = $('physStatus');
  const quietMode = $('quietMode');
  const anchorName = $('anchorName');
  const anchorCost = $('anchorCost');
  const anchorCurrencyHint = $('anchorCurrencyHint');
  const saveAnchorBtn = $('saveAnchorBtn');
  const clearAnchorBtn = $('clearAnchorBtn');
  const anchorStatus = $('anchorStatus');
  const llmEnable = $('llmEnable');
  const llmEndpoint = $('llmEndpoint');
  const llmModel = $('llmModel');
  const llmKey = $('llmKey');
  const llmProvider = $('llmProvider');
  const saveLlmBtn = $('saveLlmBtn');
  const clearLlmBtn = $('clearLlmBtn');
  const llmStatus = $('llmStatus');
  const llmPrefer = $('llmPrefer');
  const testLlmBtn = $('testLlmBtn');
  const checkModelsBtn = $('checkModelsBtn');
  const showTranslation = $('showTranslation');
  const translationLang = $('translationLang');

  // Initialize all modules
  await initLanguage(uiLanguage);
  await initCurrency(sel, anchorCurrencyHint);
  await initPreferences({ explainToggle, explainLang, showTranslation, translationLang, quietMode, llmPrefer });
  await initPhysical({ physHeight, physWeight, physFoot, physFit });
  await initAnchor({ anchorName, anchorCost, anchorCurrencyHint });
  await initLlm({ llmEnable, llmEndpoint, llmModel, llmKey, llmProvider, llmPrefer }, i18n);
  updateFxStatus(fxStatus, i18n);

  // Language save button handler - switch language immediately
  if (saveLangBtn) {
    saveLangBtn.addEventListener('click', async () => {
      const newLang = uiLanguage.value;
      saveLangBtn.disabled = true;
      saveLangBtn.textContent = '...';
      await switchLanguage(newLang);
      saveLangBtn.disabled = false;
      saveLangBtn.textContent = i18n('btnSave', 'Save');
      
      // Re-render FX status with new language
      chrome.storage.local.get([STORAGE_KEYS.FX_LAST_UPDATED, STORAGE_KEYS.FX_SOURCE, STORAGE_KEYS.FX_TO_CNY], (res) => {
        if (res[STORAGE_KEYS.FX_LAST_UPDATED]) {
          const dt = new Date(res[STORAGE_KEYS.FX_LAST_UPDATED]);
          const count = res[STORAGE_KEYS.FX_TO_CNY] ? Object.keys(res[STORAGE_KEYS.FX_TO_CNY]).length : 0;
          fxStatus.textContent = `${i18n('fxSource', 'Source')}: ${res[STORAGE_KEYS.FX_SOURCE] || 'unknown'} | ${i18n('fxUpdated', 'Updated')}: ${dt.toLocaleString()} | ${count} ${i18n('fxCurrencies', 'currencies')}`;
        }
      });
    });
  }

  // Event listeners
  saveBtn.addEventListener('click', () => {
    const code = (sel.value || 'CNY').toUpperCase();
    chrome.storage.local.set({ [STORAGE_KEYS.TARGET_CURRENCY]: code }, () => {
      saveStatus.textContent = i18n('statusSaved', 'Saved');
      saveStatus.className = 'muted ok';
      setTimeout(() => { saveStatus.textContent = ''; }, 1500);
    });
  });

  resetBtn.addEventListener('click', () => {
    chrome.storage.local.remove(STORAGE_KEYS.TARGET_CURRENCY, () => {
      saveStatus.textContent = i18n('statusReset', 'Reset');
      saveStatus.className = 'muted ok';
      setTimeout(() => { saveStatus.textContent = ''; }, 1500);
    });
  });

  refreshFxBtn.addEventListener('click', () => {
    fxStatus.textContent = i18n('fxRefreshing', 'Refreshing...');
    fxStatus.className = 'muted';
    chrome.runtime.sendMessage({ type: MSG_TYPES.REFRESH_FX });
  });

  explainToggle.addEventListener('change', () => {
    chrome.storage.local.set({ [STORAGE_KEYS.EXPLAIN_ENABLED]: explainToggle.checked });
  });

  explainLang.addEventListener('change', () => {
    chrome.storage.local.set({ [STORAGE_KEYS.EXPLAIN_LANG]: explainLang.value });
  });

  saveAnchorBtn.addEventListener('click', () => {
    const name = anchorName.value.trim();
    const cost = parseFloat(anchorCost.value);
    if (!name || !isFinite(cost) || cost <= 0) {
      anchorStatus.textContent = i18n('statusError', 'Invalid input');
      anchorStatus.className = 'muted warn';
      return;
    }
    chrome.storage.local.get([STORAGE_KEYS.TARGET_CURRENCY], (res) => {
      const cur = (res[STORAGE_KEYS.TARGET_CURRENCY] || 'CNY').toUpperCase();
      chrome.storage.local.set({ [STORAGE_KEYS.ANCHOR_UNIT]: { name, cost, currency: cur } }, () => {
        anchorCurrencyHint.textContent = cur;
        anchorStatus.textContent = i18n('statusSaved', 'Saved');
        anchorStatus.className = 'muted ok';
        setTimeout(() => { anchorStatus.textContent = ''; }, 1500);
      });
    });
  });

  clearAnchorBtn.addEventListener('click', () => {
    chrome.storage.local.remove(STORAGE_KEYS.ANCHOR_UNIT, () => {
      anchorName.value = '';
      anchorCost.value = '';
      anchorStatus.textContent = i18n('statusCleared', 'Cleared');
      anchorStatus.className = 'muted ok';
      setTimeout(() => { anchorStatus.textContent = ''; }, 1500);
    });
  });

  llmEnable.addEventListener('change', () => {
    setLlmInputsEnabled(llmEnable.checked);
    if (!llmEnable.checked) {
      chrome.storage.local.remove(STORAGE_KEYS.LLM_CONFIG, () => {
        llmStatus.textContent = i18n('statusCleared', 'LLM disabled');
        llmStatus.className = 'muted ok';
        setTimeout(() => { llmStatus.textContent = ''; }, 1500);
      });
    }
  });

  llmProvider.addEventListener('change', () => {
    applyPreset(llmProvider.value);
  });

  saveLlmBtn.addEventListener('click', () => {
    if (!llmEnable.checked) {
      llmStatus.textContent = i18n('statusError', 'Enable LLM first');
      llmStatus.className = 'muted warn';
      return;
    }
    const provider = llmProvider.value;
    const endpoint = llmEndpoint.value.trim();
    const model = llmModel.value.trim() || 'gpt-4o-mini';
    const api_key = llmKey.value.trim();
    if (!endpoint || !api_key) {
      llmStatus.textContent = i18n('statusError', 'Enter endpoint and API key');
      llmStatus.className = 'muted warn';
      return;
    }
    chrome.storage.local.set({ [STORAGE_KEYS.LLM_CONFIG]: { provider, endpoint, model, api_key } }, () => {
      llmStatus.textContent = i18n('statusSaved', 'Saved');
      llmStatus.className = 'muted ok';
      setTimeout(() => { llmStatus.textContent = ''; }, 1500);
    });
  });

  clearLlmBtn.addEventListener('click', () => {
    chrome.storage.local.remove(STORAGE_KEYS.LLM_CONFIG, () => {
      llmEnable.checked = false;
      setLlmInputsEnabled(false);
      llmStatus.textContent = i18n('statusCleared', 'Cleared');
      llmStatus.className = 'muted ok';
      setTimeout(() => { llmStatus.textContent = ''; }, 1500);
    });
  });

  testLlmBtn.addEventListener('click', () => {
    const endpoint = llmEndpoint.value.trim();
    const model = llmModel.value.trim();
    const api_key = llmKey.value.trim();
    if (!endpoint || !api_key) {
      llmStatus.textContent = i18n('statusError', 'Enter endpoint and API key');
      llmStatus.className = 'muted warn';
      return;
    }
    llmStatus.textContent = i18n('llmTesting', 'Testing...');
    llmStatus.className = 'muted';
    chrome.runtime.sendMessage({ type: MSG_TYPES.TEST_LLM, cfg: { endpoint, model, api_key } }, (res) => {
      if (chrome.runtime.lastError) {
        llmStatus.textContent = i18n('statusError', 'Error') + ': ' + chrome.runtime.lastError.message;
        llmStatus.className = 'muted warn';
        return;
      }
      if (res?.ok) {
        llmStatus.textContent = i18n('llmTestSuccess', 'Success') + ': ' + (res.sample || 'ok');
        llmStatus.className = 'muted ok';
      } else {
        llmStatus.textContent = i18n('llmTestFailed', 'Failed') + ': ' + (res?.error || 'unknown');
        llmStatus.className = 'muted warn';
      }
    });
  });

  checkModelsBtn.addEventListener('click', () => {
    const api_key = llmKey.value.trim();
    if (!api_key) {
      alert(i18n('statusError', 'Enter API key first'));
      return;
    }
    checkModelsBtn.textContent = i18n('fxLoading', 'Loading...');
    checkModelsBtn.disabled = true;
    chrome.runtime.sendMessage({ type: MSG_TYPES.LIST_MODELS, api_key }, (res) => {
      checkModelsBtn.textContent = i18n('btnListModels', 'List Models');
      checkModelsBtn.disabled = false;
      if (res?.error) {
        alert(i18n('statusError', 'Error') + ': ' + res.error);
        return;
      }
      const models = (res.models || [])
        .map(m => m.name.replace('models/', ''))
        .filter(n => n.includes('gemini'));
      if (models.length === 0) {
        alert('No models found');
      } else {
        const picked = prompt('Available models:\n\n' + models.join('\n'), models[0]);
        if (picked) llmModel.value = picked.trim();
      }
    });
  });

  llmPrefer.addEventListener('change', () => {
    chrome.storage.local.set({ [STORAGE_KEYS.LLM_PREFER]: llmPrefer.checked });
  });

  showTranslation.addEventListener('change', () => {
    chrome.storage.local.set({ [STORAGE_KEYS.SHOW_TRANSLATION]: showTranslation.checked });
  });

  translationLang.addEventListener('change', () => {
    chrome.storage.local.set({ [STORAGE_KEYS.TRANSLATION_LANG]: translationLang.value });
  });

  savePhysBtn.addEventListener('click', () => {
    const val = { preferred_fit: physFit.value };
    const h = parseFloat(physHeight.value);
    const w = parseFloat(physWeight.value);
    const f = parseFloat(physFoot.value);
    if (isFinite(h)) val.height_cm = h;
    if (isFinite(w)) val.weight_kg = w;
    if (isFinite(f)) val.foot_length_cm = f;
    chrome.storage.local.set({ [STORAGE_KEYS.USER_PHYSICAL]: val }, () => {
      physStatus.textContent = i18n('statusSaved', 'Saved');
      physStatus.className = 'muted ok';
      setTimeout(() => { physStatus.textContent = ''; }, 1500);
    });
  });

  clearPhysBtn.addEventListener('click', () => {
    chrome.storage.local.remove(STORAGE_KEYS.USER_PHYSICAL, () => {
      physHeight.value = '';
      physWeight.value = '';
      physFoot.value = '';
      physFit.value = 'regular';
      physStatus.textContent = i18n('statusCleared', 'Cleared');
      physStatus.className = 'muted ok';
      setTimeout(() => { physStatus.textContent = ''; }, 1500);
    });
  });

  quietMode.addEventListener('change', () => {
    chrome.storage.local.set({ [STORAGE_KEYS.QUIET_MODE]: quietMode.checked });
  });

  // Listen for storage changes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[STORAGE_KEYS.FX_LAST_UPDATED] || changes[STORAGE_KEYS.FX_TO_CNY]) {
      chrome.storage.local.get([STORAGE_KEYS.FX_LAST_UPDATED, STORAGE_KEYS.FX_SOURCE, STORAGE_KEYS.FX_TO_CNY], (res) => {
        const dt = res[STORAGE_KEYS.FX_LAST_UPDATED] ? new Date(res[STORAGE_KEYS.FX_LAST_UPDATED]) : null;
        const count = res[STORAGE_KEYS.FX_TO_CNY] ? Object.keys(res[STORAGE_KEYS.FX_TO_CNY]).length : 0;
        fxStatus.textContent = dt 
          ? `${i18n('fxSource', 'Source')}: ${res[STORAGE_KEYS.FX_SOURCE] || 'unknown'} | ${i18n('fxUpdated', 'Updated')}: ${dt.toLocaleString()} | ${count} ${i18n('fxCurrencies', 'currencies')}`
          : i18n('fxNoData', 'No FX data');
        fxStatus.className = 'muted';
      });
    }
    if (changes[STORAGE_KEYS.FX_FETCHING] && changes[STORAGE_KEYS.FX_FETCHING].newValue) {
      fxStatus.textContent = i18n('fxRefreshing', 'Refreshing...');
    }
    if (changes[STORAGE_KEYS.FX_FETCH_ERROR] && changes[STORAGE_KEYS.FX_FETCH_ERROR].newValue) {
      fxStatus.textContent = i18n('fxFailed', 'Refresh failed') + ': ' + changes[STORAGE_KEYS.FX_FETCH_ERROR].newValue;
      fxStatus.className = 'muted warn';
    }
    if (changes[STORAGE_KEYS.TARGET_CURRENCY]) {
      const cur = (changes[STORAGE_KEYS.TARGET_CURRENCY].newValue || 'CNY').toUpperCase();
      anchorCurrencyHint.textContent = cur;
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
