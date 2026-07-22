/**
 * Babel Tower - Options Page: Anchor Unit Module
 * Handles custom anchor unit configuration for price comparisons
 */

import { STORAGE_KEYS } from '../shared/constants';

/**
 * Initialize anchor unit UI
 * @param {Object} elements - DOM elements
 * @param {string} targetCurrency - Current target currency
 */
export async function initAnchor(elements, targetCurrency) {
  const { anchorName, anchorCost, anchorCurrencyHint } = elements;
  
  const res = await chrome.storage.local.get([STORAGE_KEYS.ANCHOR_UNIT, STORAGE_KEYS.TARGET_CURRENCY]);
  const cur = targetCurrency || (res[STORAGE_KEYS.TARGET_CURRENCY] || 'CNY').toUpperCase();
  
  if (res[STORAGE_KEYS.ANCHOR_UNIT]) {
    anchorName.value = res[STORAGE_KEYS.ANCHOR_UNIT].name || '';
    anchorCost.value = res[STORAGE_KEYS.ANCHOR_UNIT].cost ?? '';
    if (res[STORAGE_KEYS.ANCHOR_UNIT].currency) {
      anchorCurrencyHint.textContent = res[STORAGE_KEYS.ANCHOR_UNIT].currency;
    }
  }
  
  anchorCurrencyHint.textContent = cur;
}

/**
 * Save anchor unit
 * @param {Object} elements - DOM elements
 * @param {HTMLElement} statusEl - Status display element
 * @param {Function} i18n - Translation function
 */
export function saveAnchor(elements, statusEl, i18n) {
  const { anchorName, anchorCost, anchorCurrencyHint } = elements;
  
  const name = anchorName.value.trim();
  const cost = parseFloat(anchorCost.value);
  
  if (!name || !Number.isFinite(cost) || cost <= 0) {
    statusEl.textContent = i18n('statusError', 'Invalid input');
    statusEl.className = 'muted warn';
    return;
  }
  
  // Get current currency
  chrome.storage.local.get([STORAGE_KEYS.TARGET_CURRENCY], (res) => {
    const cur = (res[STORAGE_KEYS.TARGET_CURRENCY] || 'CNY').toUpperCase();
    
    chrome.storage.local.set({ 
      [STORAGE_KEYS.ANCHOR_UNIT]: { name, cost, currency: cur } 
    }, () => {
      anchorCurrencyHint.textContent = cur;
      statusEl.textContent = i18n('statusSaved', 'Saved');
      statusEl.className = 'muted ok';
      setTimeout(() => { statusEl.textContent = ''; }, 1500);
    });
  });
}

/**
 * Clear anchor unit
 * @param {Object} elements - DOM elements
 * @param {HTMLElement} statusEl - Status display element
 * @param {Function} i18n - Translation function
 */
export function clearAnchor(elements, statusEl, i18n) {
  const { anchorName, anchorCost } = elements;
  
  chrome.storage.local.remove(STORAGE_KEYS.ANCHOR_UNIT, () => {
    anchorName.value = '';
    anchorCost.value = '';
    
    statusEl.textContent = i18n('statusCleared', 'Cleared');
    statusEl.className = 'muted ok';
    setTimeout(() => { statusEl.textContent = ''; }, 1500);
  });
}

/**
 * Validate anchor unit input
 * @param {string} name - Anchor name
 * @param {string|number} cost - Anchor cost
 * @returns {{valid: boolean, error?: string}} Validation result
 */
export function validateAnchorInput(name, cost) {
  const trimmedName = (name || '').trim();
  const numCost = parseFloat(cost);
  
  if (!trimmedName) {
    return { valid: false, error: 'Name is required' };
  }
  
  if (!Number.isFinite(numCost) || numCost <= 0) {
    return { valid: false, error: 'Cost must be a positive number' };
  }
  
  return { valid: true };
}
