/**
 * Babel Tower - Options Page: Currency & FX Management Module
 * Handles currency selection and exchange rate display
 */

import { CURRENCIES, STORAGE_KEYS } from '../shared/constants.js';

/**
 * Render currency options in selector
 * @param {HTMLSelectElement} select - Select element
 * @param {string} current - Current selected currency code
 */
export function renderCurrencyOptions(select, current) {
  select.innerHTML = '';
  CURRENCIES.forEach(code => {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = code;
    if ((current || '').toUpperCase() === code) opt.selected = true;
    select.appendChild(opt);
  });
}

/**
 * Initialize currency settings UI
 * @param {HTMLSelectElement} targetCurrencySelect - Currency selector
 * @param {HTMLElement} anchorCurrencyHint - Currency hint display
 * @returns {Promise<void>}
 */
export async function initCurrency(targetCurrencySelect, anchorCurrencyHint) {
  const res = await chrome.storage.local.get([STORAGE_KEYS.TARGET_CURRENCY]);
  const cur = (res[STORAGE_KEYS.TARGET_CURRENCY] || '').toUpperCase();
  renderCurrencyOptions(targetCurrencySelect, cur || 'CNY');
  anchorCurrencyHint.textContent = cur || 'CNY';
}

/**
 * Save currency setting
 * @param {HTMLSelectElement} select - Currency selector
 * @param {HTMLElement} statusEl - Status display element
 * @param {Function} i18n - Translation function
 */
export function saveCurrency(select, statusEl, i18n) {
  const code = (select.value || 'CNY').toUpperCase();
  chrome.storage.local.set({ [STORAGE_KEYS.TARGET_CURRENCY]: code }, () => {
    statusEl.textContent = i18n('statusSaved', 'Saved');
    statusEl.className = 'muted ok';
    setTimeout(() => { statusEl.textContent = ''; }, 1500);
  });
}

/**
 * Reset currency to default
 * @param {HTMLElement} statusEl - Status display element
 * @param {Function} i18n - Translation function
 */
export function resetCurrency(statusEl, i18n) {
  chrome.storage.local.remove(STORAGE_KEYS.TARGET_CURRENCY, () => {
    statusEl.textContent = i18n('statusReset', 'Reset');
    statusEl.className = 'muted ok';
    setTimeout(() => { statusEl.textContent = ''; }, 1500);
  });
}

/**
 * Update FX status display
 * @param {HTMLElement} fxStatusEl - Status display element
 * @param {Function} i18n - Translation function
 */
export function updateFxStatus(fxStatusEl, i18n) {
  chrome.storage.local.get([
    STORAGE_KEYS.FX_LAST_UPDATED,
    STORAGE_KEYS.FX_SOURCE,
    STORAGE_KEYS.FX_TO_CNY,
    STORAGE_KEYS.FX_FETCHING,
    STORAGE_KEYS.FX_FETCH_ERROR
  ], (res) => {
    if (res[STORAGE_KEYS.FX_LAST_UPDATED]) {
      const dt = new Date(res[STORAGE_KEYS.FX_LAST_UPDATED]);
      const count = res[STORAGE_KEYS.FX_TO_CNY] ? Object.keys(res[STORAGE_KEYS.FX_TO_CNY]).length : 0;
      fxStatusEl.textContent = `${i18n('fxSource', 'Source')}: ${res[STORAGE_KEYS.FX_SOURCE] || 'unknown'} | ${i18n('fxUpdated', 'Updated')}: ${dt.toLocaleString()} | ${count} ${i18n('fxCurrencies', 'currencies')}`;
    } else {
      fxStatusEl.textContent = i18n('fxNoData', 'No FX data yet (using fallback rates)');
    }
    
    if (res[STORAGE_KEYS.FX_FETCHING]) {
      fxStatusEl.textContent = i18n('fxRefreshing', 'Refreshing...');
    }
    
    if (res[STORAGE_KEYS.FX_FETCH_ERROR]) {
      fxStatusEl.textContent = i18n('fxFailed', 'Refresh failed') + ': ' + res[STORAGE_KEYS.FX_FETCH_ERROR];
      fxStatusEl.className = 'muted warn';
    }
  });
}

/**
 * Trigger FX refresh
 * @param {HTMLElement} fxStatusEl - Status display element
 * @param {Function} i18n - Translation function
 */
export function refreshFx(fxStatusEl, i18n) {
  fxStatusEl.textContent = i18n('fxRefreshing', 'Refreshing...');
  fxStatusEl.className = 'muted';
  chrome.runtime.sendMessage({ type: 'bt_refresh_fx' });
}
