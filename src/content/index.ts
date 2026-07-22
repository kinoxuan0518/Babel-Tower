/**
 * Babel Tower v3 - Content Script Entry
 * 
 * Optimized Architecture:
 * - Modular code organization
 * - All LLM calls through background proxy (security)
 * - DOMPurify for XSS protection
 * - Precompiled regex patterns (performance)
 * - Centralized state management with caching
 */

import { MSG_TYPES, TIMING } from '../shared/constants';
import { debounce, logger } from '../shared/utils';
import { initializeState, getState, updateState } from './state/index';
import { extractPrice, parseSizeContext, isFeatureSelection, shouldExplain } from './parsers/index';
import { generatePriceHeuristic, generateSizeHeuristic, generatePackHeuristic, gatherPageContext, classifyPageIntentHeuristic, isPackDimsNotHelpful, isGarmentContext } from './heuristics/index';
import { hasLLM, generateCognitiveWithLLM, generateTranslationWithLLM, classifyPageIntentWithLLM } from './llm/index';
import { showOverlay, updateOverlay, removeOverlay, getSelectionCoordinates } from './overlay/index';

// Prevent duplicate initialization
if (window.__BT_RUNNING) {
  logger.debug('Content script already running, skip init');
} else {
  window.__BT_RUNNING = true;
  logger.info('Babel Tower v3 content script loaded');
  init();
}

// Request counter for race condition prevention
let lastRequestId = 0;

/**
 * Initialize content script
 */
async function init() {
  // Load state and settings
  await initializeState();
  
  // Gather page context
  const pageContext = gatherPageContext();
  const pageIntent = classifyPageIntentHeuristic(pageContext);
  updateState({ pageContext, pageIntent });
  
  // Try LLM classification for uncertain pages
  classifyPageIntentSmart(pageContext);
  
  // Setup event listeners
  setupEventListeners();
  
  logger.info('Initialization complete');
}

/**
 * Setup all event listeners
 */
function setupEventListeners() {
  const state = getState();
  
  // Mouse selection
  document.addEventListener('mouseup', (e) => {
    if (!getState().quietMode) handleSelectionEvent(e);
  }, true);
  
  // Touch selection
  document.addEventListener('touchend', (e) => {
    if (!getState().quietMode) handleSelectionEvent(e);
  }, true);
  
  // Keyboard selection (debounced)
  const debouncedHandler = debounce(() => {
    const sel = window.getSelection();
    const text = sel ? sel.toString().trim() : '';
    if (!getState().quietMode && text && text.length >= 2) {
      handleSelectionEvent({});
    }
  }, TIMING.DEBOUNCE_SELECTION_MS);
  
  document.addEventListener('selectionchange', debouncedHandler);
  
  // Listen for explicit analyze command (context menu / toolbar)
  try {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg?.type === MSG_TYPES.ANALYZE_SELECTION) {
        const text = (msg.text || '').trim();
        const sel = window.getSelection();
        const fallbackText = sel ? sel.toString().trim() : '';
        const useText = text || fallbackText;
        
        if (useText) {
          const coords = getSelectionCoordinates({});
          analyzeText(useText, coords.x, coords.y).catch(() => {});
        }
      }
    });
  } catch {}
}

/**
 * Handle selection event
 * @param {Event} event
 */
async function handleSelectionEvent(event) {
  const selection = window.getSelection();
  const selectedText = selection ? selection.toString().trim() : '';
  
  logger.debug('Selection:', selectedText);
  
  if (!selectedText) {
    removeOverlay();
    return;
  }
  
  if (selectedText.length < 2) return;
  
  const { x, y } = getSelectionCoordinates(event);
  await analyzeText(selectedText, x, y);
}

/**
 * Analyze text and show overlay
 * @param {string} selectedText Text to analyze
 * @param {number} x X coordinate
 * @param {number} y Y coordinate
 */
async function analyzeText(selectedText, x, y) {
  // Show loading overlay
  showOverlay(x, y, {
    original: selectedText,
    insight: 'Analyzing...',
    anchor: 'Hold on a sec'
  }, getState().showTranslation);
  
  const requestId = ++lastRequestId;
  
  try {
    const result = await generateInsight(selectedText);
    
    // Check for race condition
    if (requestId !== lastRequestId) return;
    
    if (result === null) {
      removeOverlay();
      return;
    }
    
    updateOverlay({
      original: selectedText,
      insight: result.text,
      anchor: result.anchor,
      translation: result.translation || '',
      visual: result.visual || ''
    }, getState().showTranslation);
    
  } catch (err) {
    logger.error('Analysis failed:', err);
    
    if (requestId === lastRequestId) {
      updateOverlay({
        original: selectedText,
        insight: `Error: ${err.message || 'Unknown error'}`,
        anchor: 'Check console or reload extension'
      }, false);
    }
  }
}

/**
 * Generate insight for selected text
 * @param {string} selectedText
 * @returns {Promise<{ text: string, anchor: string, translation?: string, visual?: string } | null>}
 */
async function generateInsight(selectedText) {
  const state = getState();
  const useLLM = hasLLM();
  
  // Try to parse as price
  const price = extractPrice(selectedText);
  
  // Try to parse as size
  const sizeCtx = parseSizeContext(selectedText);
  
  // Check if it's a feature selection
  const isFeature = isFeatureSelection(selectedText);
  
  // === PRICE SCENARIO ===
  if (price && Number.isFinite(price.amount)) {
    const result = generatePriceHeuristic(price.amount, price.currency, {
      targetCurrency: state.targetCurrency,
      fxToCNY: state.fxToCNY,
      pageIntent: state.pageIntent,
      customAnchorUnit: state.customAnchorUnit,
      profile: state.profile
    });
    
    // Add translation if LLM available
    if (useLLM && state.showTranslation) {
      try {
        result.translation = await generateTranslationWithLLM(selectedText, state.translationLang);
      } catch {}
    }
    
    return result;
  }
  
  // === FEATURE SCENARIO ===
  if (isFeature) {
    if (useLLM) {
      return await generateCognitiveWithLLM({
        selectedText,
        task: 'feature',
        price: null,
        sizeCtx: null,
        lang: state.explainLang
      });
    } else {
      return { text: 'LLM required for feature explanation', anchor: 'Configure LLM in settings' };
    }
  }
  
  // === PACK DIMENSIONS SCENARIO ===
  if (sizeCtx?.kind === 'pack') {
    // Skip if not helpful for this page type
    if (isPackDimsNotHelpful(state.pageContext)) return null;
    if (isGarmentContext(state.pageContext)) return null;
    
    if (useLLM && state.llmPrefer) {
      return await generateCognitiveWithLLM({
        selectedText,
        task: 'size',
        price: null,
        sizeCtx,
        lang: state.explainLang
      });
    } else {
      const result = generatePackHeuristic(sizeCtx, { lang: state.explainLang });
      if (useLLM && state.showTranslation) {
        try {
          result.translation = await generateTranslationWithLLM(selectedText, state.translationLang);
        } catch {}
      }
      return result;
    }
  }
  
  // === SIZE SCENARIO ===
  if (sizeCtx) {
    if (useLLM && state.llmPrefer) {
      return await generateCognitiveWithLLM({
        selectedText,
        task: 'size',
        price: null,
        sizeCtx,
        lang: state.explainLang
      });
    } else {
      const result = generateSizeHeuristic(sizeCtx, {
        lang: state.explainLang,
        userPhysical: state.userPhysical
      });
      if (useLLM && state.showTranslation) {
        try {
          result.translation = await generateTranslationWithLLM(selectedText, state.translationLang);
        } catch {}
      }
      return result;
    }
  }
  
  // === TERM EXPLANATION SCENARIO ===
  if (state.explainEnabled && shouldExplain(selectedText)) {
    if (useLLM) {
      return await generateCognitiveWithLLM({
        selectedText,
        task: 'term',
        price: null,
        sizeCtx: null,
        lang: state.explainLang
      });
    } else {
      return { text: 'LLM required for term explanation', anchor: 'Configure LLM in settings' };
    }
  }
  
  // No match - don't show overlay
  return null;
}

/**
 * Smart page intent classification (uses LLM for uncertain pages)
 * @param {Object} pageContext
 */
async function classifyPageIntentSmart(pageContext) {
  const state = getState();
  
  if (!hasLLM()) return;
  if (state.pageIntent?.category !== 'other') return;
  
  try {
    // Check cache first
    const cacheKey = `${pageContext?.host || ''}${(location.pathname || '').split('/').slice(0, 2).join('/')}`;
    
    chrome.storage.local.get(['bt_page_intent_cache'], async (res) => {
      const cache = res.bt_page_intent_cache || {};
      
      if (cache[cacheKey]) {
        updateState({ pageIntent: cache[cacheKey] });
        return;
      }
      
      try {
        const intent = await classifyPageIntentWithLLM(pageContext);
        if (intent?.category) {
          updateState({ pageIntent: intent });
          
          // Update cache
          const next = { ...cache, [cacheKey]: intent };
          const keys = Object.keys(next);
          if (keys.length > TIMING.PAGE_INTENT_CACHE_MAX) {
            delete next[keys[0]];
          }
          chrome.storage.local.set({ bt_page_intent_cache: next });
        }
      } catch {}
    });
  } catch {}
}
