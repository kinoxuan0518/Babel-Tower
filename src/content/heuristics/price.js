/**
 * Babel Tower - Price Heuristics
 * Generates cognitive insights for price without LLM
 */

import { FALLBACK_FX_TO_CNY, COGNITIVE_ANCHORS, PPP_TABLE } from '../../shared/constants.js';
import { normalizeCurrency } from '../../shared/utils.js';

/**
 * Convert amount to target currency via CNY
 * @param {number} amount Original amount
 * @param {string} fromCurrency Source currency
 * @param {string} toCurrency Target currency
 * @param {Object} fxToCNY Exchange rates
 * @returns {{ valueInTarget: number, valueInCNY: number }}
 */
export function convertCurrency(amount, fromCurrency, toCurrency, fxToCNY) {
  const fx = { ...FALLBACK_FX_TO_CNY, ...fxToCNY };
  const from = normalizeCurrency(fromCurrency);
  const to = normalizeCurrency(toCurrency);
  
  let valueInTarget = amount;
  let valueInCNY = amount;
  
  if (from !== to) {
    const fromToCNY = fx[from];
    const toToCNY = fx[to];
    
    if (fromToCNY && toToCNY) {
      valueInCNY = amount * fromToCNY;
      valueInTarget = to === 'CNY' ? valueInCNY : (valueInCNY / toToCNY);
    }
  } else if (from === 'CNY') {
    valueInCNY = amount;
    valueInTarget = amount;
  } else {
    const rate = fx[from];
    if (rate) {
      valueInCNY = amount * rate;
    }
  }
  
  return { valueInTarget, valueInCNY };
}

/**
 * Get social cost comparison (lunch index)
 * @param {number} valueInCNY Value in CNY
 * @returns {{ lunches: number, text: string }}
 */
export function getSocialCost(valueInCNY) {
  const baseLunchCNY = COGNITIVE_ANCHORS.lunch.costCNY;
  const lunches = valueInCNY / baseLunchCNY;
  
  return {
    lunches,
    text: lunches < 1 ? '不到一顿简餐' : `≈ ${lunches.toFixed(1)} 顿午餐`
  };
}

/**
 * Get dynamic anchor based on page context
 * @param {number} valueInCNY Value in CNY
 * @param {Object} pageIntent Page intent classification
 * @returns {{ text: string, cost: number } | null}
 */
export function getDynamicAnchor(valueInCNY, pageIntent) {
  const category = pageIntent?.category || 'other';
  
  // Electronics/Audio -> Switch game
  if (category === 'electronics' || category === 'audio') {
    const gameCost = COGNITIVE_ANCHORS.switchGame.costCNY;
    if (valueInCNY > gameCost * 0.5) {
      const g = valueInCNY / gameCost;
      return { text: `≈ ${g.toFixed(1)} 张 Switch 游戏`, cost: gameCost };
    }
  }
  
  // Supplement -> Milk tea
  if (category === 'supplement') {
    const teaCost = COGNITIVE_ANCHORS.milkTea.costCNY;
    if (valueInCNY > 5) {
      const t = valueInCNY / teaCost;
      return { text: `≈ ${t.toFixed(1)} 杯奶茶`, cost: teaCost };
    }
  }
  
  // Clothing -> Uniqlo T-shirt
  if (category === 'clothing') {
    const shirtCost = COGNITIVE_ANCHORS.uniqloTee.costCNY;
    if (valueInCNY > 40) {
      const s = valueInCNY / shirtCost;
      return { text: `≈ ${s.toFixed(1)} 件优衣库 T恤`, cost: shirtCost };
    }
  }
  
  return null;
}

/**
 * Generate custom anchor text
 * @param {number} valueInTarget Value in target currency
 * @param {string} targetCurrency Target currency
 * @param {Object} customAnchorUnit Custom anchor { name, cost, currency }
 * @param {Object} fxToCNY Exchange rates
 * @returns {string} Anchor text
 */
export function getCustomAnchorText(valueInTarget, targetCurrency, customAnchorUnit, fxToCNY) {
  if (!customAnchorUnit?.name) return '';
  
  let cost = Number(customAnchorUnit.cost);
  if (!Number.isFinite(cost) || cost <= 0) return '';
  
  const name = customAnchorUnit.name;
  let costCurrency = normalizeCurrency(customAnchorUnit.currency || targetCurrency);
  
  // Convert anchor cost to target currency if needed
  if (costCurrency !== targetCurrency) {
    const fx = { ...FALLBACK_FX_TO_CNY, ...fxToCNY };
    const srcToCNY = fx[costCurrency];
    const tgtToCNY = fx[targetCurrency];
    
    if (srcToCNY && tgtToCNY) {
      const costInCNY = cost * srcToCNY;
      cost = costInCNY / tgtToCNY;
    } else {
      return '';
    }
  }
  
  const units = valueInTarget / cost;
  const unitsText = units < 10 ? units.toFixed(1) : Math.round(units).toString();
  const costText = `${targetCurrency} ${cost.toFixed(2)}`;
  
  return `约等于 ${unitsText} ${name}（1 ${name} ≈ ${costText}）`;
}

/**
 * Generate heuristic price insight
 * @param {number} amount Price amount
 * @param {string} fromCurrency Source currency
 * @param {Object} config Configuration { targetCurrency, fxToCNY, pageIntent, customAnchorUnit, profile }
 * @returns {{ text: string, anchor: string }}
 */
export function generatePriceHeuristic(amount, fromCurrency, config) {
  const {
    targetCurrency = 'CNY',
    fxToCNY = {},
    pageIntent = null,
    customAnchorUnit = null,
    profile = null
  } = config;
  
  const fx = { ...FALLBACK_FX_TO_CNY, ...fxToCNY };
  const { valueInTarget, valueInCNY } = convertCurrency(amount, fromCurrency, targetCurrency, fx);
  
  const mainText = `${targetCurrency} ${valueInTarget.toFixed(1)}`;
  let anchorText = '';
  
  // 1. Try dynamic context anchor
  const dyn = getDynamicAnchor(valueInCNY, pageIntent);
  
  // 2. Try custom anchor
  const customText = getCustomAnchorText(valueInTarget, targetCurrency, customAnchorUnit, fx);
  
  if (dyn) {
    anchorText = dyn.text;
  } else if (customText) {
    anchorText = customText;
  } else if (targetCurrency === 'CNY') {
    // 3. Fallback to coffee/lunch
    const coffeeCost = profile?.cognitive_anchors?.coffee_benchmark?.cost ?? COGNITIVE_ANCHORS.coffee.costCNY;
    const coffeeName = profile?.cognitive_anchors?.coffee_benchmark?.name ?? COGNITIVE_ANCHORS.coffee.name;
    
    if (coffeeCost > 0 && valueInCNY < 100) {
      const cups = (valueInCNY / coffeeCost).toFixed(1);
      anchorText = `≈ ${cups} 杯${coffeeName}`;
    } else {
      const social = getSocialCost(valueInCNY);
      if (valueInCNY >= 30) {
        anchorText = social.text;
      }
    }
  }
  
  // Add purchasing power hint for JPY
  if (normalizeCurrency(fromCurrency) === 'JPY' && fx['JPY'] < 0.055) {
    anchorText += ' (汇率划算)';
  }
  
  return { text: mainText, anchor: anchorText.trim() };
}
