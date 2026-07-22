/**
 * Babel Tower - Options Page: Physical Measurements Module
 * Handles user physical data (height, weight, foot length) and fit preferences
 */

import { STORAGE_KEYS } from '../shared/constants';

/**
 * Initialize physical measurements UI
 * @param {Object} elements - DOM elements
 */
export async function initPhysical(elements) {
  const { physHeight, physWeight, physFoot, physFit } = elements;
  
  const res = await chrome.storage.local.get([STORAGE_KEYS.USER_PHYSICAL]);
  const p = res[STORAGE_KEYS.USER_PHYSICAL] || {};
  
  if (typeof p.height_cm === 'number') physHeight.value = p.height_cm;
  if (typeof p.weight_kg === 'number') physWeight.value = p.weight_kg;
  if (typeof p.foot_length_cm === 'number') physFoot.value = p.foot_length_cm;
  physFit.value = p.preferred_fit || 'regular';
}

/**
 * Save physical measurements
 * @param {Object} elements - DOM elements
 * @param {HTMLElement} statusEl - Status display element
 * @param {Function} i18n - Translation function
 */
export function savePhysical(elements, statusEl, i18n) {
  const { physHeight, physWeight, physFoot, physFit } = elements;
  
  const data = {
    height_cm: parseFloat(physHeight.value) || null,
    weight_kg: parseFloat(physWeight.value) || null,
    foot_length_cm: parseFloat(physFoot.value) || null,
    preferred_fit: physFit.value.trim() || 'regular'
  };
  
  // Filter out null values
  const cleanData = {};
  Object.keys(data).forEach(key => {
    if (data[key] !== null) cleanData[key] = data[key];
  });
  
  chrome.storage.local.set({ [STORAGE_KEYS.USER_PHYSICAL]: cleanData }, () => {
    statusEl.textContent = i18n('statusSaved', 'Saved');
    statusEl.className = 'muted ok';
    setTimeout(() => { statusEl.textContent = ''; }, 1500);
  });
}

/**
 * Clear physical measurements
 * @param {Object} elements - DOM elements
 * @param {HTMLElement} statusEl - Status display element
 * @param {Function} i18n - Translation function
 */
export function clearPhysical(elements, statusEl, i18n) {
  const { physHeight, physWeight, physFoot, physFit } = elements;
  
  chrome.storage.local.remove(STORAGE_KEYS.USER_PHYSICAL, () => {
    physHeight.value = '';
    physWeight.value = '';
    physFoot.value = '';
    physFit.value = 'regular';
    
    statusEl.textContent = i18n('statusCleared', 'Cleared');
    statusEl.className = 'muted ok';
    setTimeout(() => { statusEl.textContent = ''; }, 1500);
  });
}

/**
 * Validate physical measurement input
 * @param {string} value - Input value
 * @param {string} type - Measurement type ('height', 'weight', 'foot')
 * @returns {boolean} Whether the value is valid
 */
export function validatePhysicalInput(value, type) {
  const num = parseFloat(value);
  
  if (!Number.isFinite(num) || num <= 0) return false;
  
  switch (type) {
    case 'height':
      return num >= 50 && num <= 250; // cm
    case 'weight':
      return num >= 2 && num <= 300; // kg
    case 'foot':
      return num >= 10 && num <= 40; // cm
    default:
      return true;
  }
}
