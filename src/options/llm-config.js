/**
 * Babel Tower - Options Page: LLM Configuration Module
 * Handles LLM provider selection, endpoint configuration, and testing
 */

import { LLM_PRESETS, STORAGE_KEYS, MSG_TYPES } from '../shared/constants.js';

/**
 * Detect provider by endpoint URL
 * @param {string} endpoint - API endpoint URL
 * @returns {string} Provider key
 */
export function detectProviderByEndpoint(endpoint) {
  const url = (endpoint || '').toLowerCase();
  if (!url) return 'openai';
  if (url.includes('openai.com')) return 'openai';
  if (url.includes('deepseek.com')) return 'deepseek';
  if (url.includes('moonshot.cn')) return 'moonshot';
  if (url.includes('api.groq.com')) return 'groq';
  if (url.includes('together.xyz')) return 'together';
  if (url.includes('googleapis.com')) return 'gemini';
  return 'custom';
}

/**
 * Apply preset configuration for selected provider
 * @param {string} providerKey - Provider key
 * @param {HTMLInputElement} endpointInput - Endpoint input field
 * @param {HTMLInputElement} modelInput - Model input field
 */
export function applyPreset(providerKey, endpointInput, modelInput) {
  const p = LLM_PRESETS[providerKey] || LLM_PRESETS.custom;
  if (providerKey !== 'custom') {
    endpointInput.value = p.endpoint;
    modelInput.value = p.model;
  }
}

/**
 * Enable/disable LLM configuration inputs
 * @param {boolean} enabled - Whether to enable inputs
 * @param {string[]} inputIds - IDs of elements to toggle
 */
export function setLlmInputsEnabled(enabled, inputIds = []) {
  const defaultIds = ['llmProvider', 'llmEndpoint', 'llmModel', 'llmKey', 'saveLlmBtn', 'checkModelsBtn'];
  const ids = inputIds.length > 0 ? inputIds : defaultIds;
  
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !enabled;
  });
}

/**
 * Initialize LLM settings UI
 * @param {Object} elements - DOM elements
 * @param {Function} i18n - Translation function
 */
export async function initLlm(elements, i18n) {
  const { llmEnable, llmEndpoint, llmModel, llmKey, llmProvider, llmPrefer } = elements;
  
  const res = await chrome.storage.local.get([STORAGE_KEYS.LLM_CONFIG, STORAGE_KEYS.LLM_PREFER]);
  const llm = res[STORAGE_KEYS.LLM_CONFIG] || {};
  const hasLLM = !!(llm.endpoint && llm.api_key);
  
  llmEnable.checked = hasLLM;
  const storedProvider = llm.provider || detectProviderByEndpoint(llm.endpoint);
  llmProvider.value = storedProvider;
  llmEndpoint.value = llm.endpoint || LLM_PRESETS[storedProvider]?.endpoint || '';
  llmModel.value = llm.model || LLM_PRESETS[storedProvider]?.model || '';
  llmKey.value = llm.api_key || '';
  llmPrefer.checked = res[STORAGE_KEYS.LLM_PREFER] !== false;
  
  setLlmInputsEnabled(llmEnable.checked);
}

/**
 * Save LLM configuration
 * @param {Object} elements - DOM elements
 * @param {HTMLElement} statusEl - Status display element
 * @param {Function} i18n - Translation function
 */
export function saveLlmConfig(elements, statusEl, i18n) {
  const { llmEnable, llmProvider, llmEndpoint, llmModel, llmKey } = elements;
  
  if (!llmEnable.checked) {
    statusEl.textContent = i18n('statusError', 'Enable LLM first');
    statusEl.className = 'muted warn';
    return;
  }
  
  const provider = llmProvider.value;
  const endpoint = llmEndpoint.value.trim();
  const model = llmModel.value.trim() || 'gpt-4o-mini';
  const apiKey = llmKey.value.trim();
  
  if (!endpoint || !apiKey) {
    statusEl.textContent = i18n('statusError', 'Enter endpoint and API key');
    statusEl.className = 'muted warn';
    return;
  }
  
  chrome.storage.local.set({ 
    [STORAGE_KEYS.LLM_CONFIG]: { provider, endpoint, model, api_key: apiKey } 
  }, () => {
    statusEl.textContent = i18n('statusSaved', 'Saved');
    statusEl.className = 'muted ok';
    setTimeout(() => { statusEl.textContent = ''; }, 1500);
  });
}

/**
 * Clear LLM configuration
 * @param {Object} elements - DOM elements
 * @param {HTMLElement} statusEl - Status display element
 * @param {Function} i18n - Translation function
 */
export function clearLlmConfig(elements, statusEl, i18n) {
  const { llmEnable } = elements;
  
  chrome.storage.local.remove(STORAGE_KEYS.LLM_CONFIG, () => {
    llmEnable.checked = false;
    setLlmInputsEnabled(false);
    statusEl.textContent = i18n('statusCleared', 'Cleared');
    statusEl.className = 'muted ok';
    setTimeout(() => { statusEl.textContent = ''; }, 1500);
  });
}

/**
 * Test LLM connection
 * @param {Object} elements - DOM elements
 * @param {HTMLElement} statusEl - Status display element
 * @param {Function} i18n - Translation function
 */
export function testLlmConnection(elements, statusEl, i18n) {
  const { llmEndpoint, llmModel, llmKey } = elements;
  
  const endpoint = llmEndpoint.value.trim();
  const model = llmModel.value.trim();
  const apiKey = llmKey.value.trim();
  
  if (!endpoint || !apiKey) {
    statusEl.textContent = i18n('statusError', 'Enter endpoint and API key');
    statusEl.className = 'muted warn';
    return;
  }
  
  statusEl.textContent = i18n('llmTesting', 'Testing...');
  statusEl.className = 'muted';
  
  chrome.runtime.sendMessage(
    { type: MSG_TYPES.TEST_LLM, cfg: { endpoint, model, api_key: apiKey } }, 
    (res) => {
      if (chrome.runtime.lastError) {
        statusEl.textContent = i18n('statusError', 'Error') + ': ' + chrome.runtime.lastError.message;
        statusEl.className = 'muted warn';
        return;
      }
      
      if (res?.ok) {
        statusEl.textContent = i18n('llmTestSuccess', 'Success') + ': ' + (res.sample || 'ok');
        statusEl.className = 'muted ok';
      } else {
        statusEl.textContent = i18n('llmTestFailed', 'Failed') + ': ' + (res?.error || 'unknown');
        statusEl.className = 'muted warn';
      }
    }
  );
}

/**
 * List available models (Gemini only)
 * @param {HTMLInputElement} apiKeyInput - API key input
 * @param {HTMLButtonElement} button - Trigger button
 * @param {Function} i18n - Translation function
 */
export function listModels(apiKeyInput, button, i18n) {
  const apiKey = apiKeyInput.value.trim();
  
  if (!apiKey) {
    alert(i18n('statusError', 'Enter API key first'));
    return;
  }
  
  button.textContent = i18n('fxLoading', 'Loading...');
  button.disabled = true;
  
  chrome.runtime.sendMessage({ type: MSG_TYPES.LIST_MODELS, api_key: apiKey }, (res) => {
    button.textContent = i18n('btnListModels', 'List Models');
    button.disabled = false;
    
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
      const picked = prompt('Available models:\n\n' + models.join('\n') + '\n\nCopy one to use:');
      if (picked) {
        document.getElementById('llmModel').value = picked.trim();
      }
    }
  });
}

/**
 * Handle LLM enable toggle
 * @param {HTMLInputElement} enableCheckbox - Enable checkbox
 * @param {HTMLElement} statusEl - Status display element
 * @param {Function} i18n - Translation function
 */
export function handleLlmEnableToggle(enableCheckbox, statusEl, i18n) {
  setLlmInputsEnabled(enableCheckbox.checked);
  
  if (!enableCheckbox.checked) {
    chrome.storage.local.remove(STORAGE_KEYS.LLM_CONFIG, () => {
      statusEl.textContent = i18n('statusCleared', 'LLM disabled');
      statusEl.className = 'muted ok';
      setTimeout(() => { statusEl.textContent = ''; }, 1500);
    });
  }
}
