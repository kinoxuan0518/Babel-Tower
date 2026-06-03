/**
 * Babel Tower v3 - Background Service Worker
 * 
 * Key responsibilities:
 * - LLM API proxy (keeps API keys secure, avoids CSP)
 * - Exchange rate fetching and caching
 * - Context menu and toolbar icon handling
 */

import { STORAGE_KEYS, MSG_TYPES, TIMING } from '../shared/constants.js';
import { fetchWithTimeout } from '../shared/utils.js';

// ==================== Exchange Rate Fetching ====================

const FX_ALARM = 'bt_fx_refresh';
let fxInFlight = false;

/**
 * Invert rates from base=CNY to fxToCNY format
 */
function invertBaseCNYRates(rates) {
  const out = { CNY: 1 };
  for (const [code, val] of Object.entries(rates || {})) {
    const v = Number(val);
    if (Number.isFinite(v) && v > 0) {
      out[String(code).toUpperCase()] = 1 / v;
    }
  }
  return out;
}

/**
 * Fetch from frankfurter.app
 */
async function fetchFromFrankfurter() {
  const res = await fetchWithTimeout('https://api.frankfurter.app/latest?from=CNY', {}, TIMING.FX_FETCH_TIMEOUT_MS);
  const data = await res.json();
  if (!data?.rates) throw new Error('frankfurter: no rates');
  return { fxToCNY: invertBaseCNYRates(data.rates), source: 'frankfurter.app' };
}

/**
 * Fetch from open.er-api.com
 */
async function fetchFromERAPI() {
  const res = await fetchWithTimeout('https://open.er-api.com/v6/latest/CNY', {}, TIMING.FX_FETCH_TIMEOUT_MS);
  const data = await res.json();
  if (!data?.rates) throw new Error('open.er-api: no rates');
  return { fxToCNY: invertBaseCNYRates(data.rates), source: 'open.er-api.com' };
}

/**
 * Fetch from jsdelivr currency-api
 */
async function fetchFromJsDelivr() {
  const res = await fetchWithTimeout('https://cdn.jsdelivr.net/gh/fawazahmed0/currency-api@1/latest/currencies/cny.json', {}, TIMING.FX_FETCH_TIMEOUT_MS);
  const data = await res.json();
  const base = data?.cny || data?.CNY;
  if (!base) throw new Error('currency-api(jsdelivr): no cny base');
  return { fxToCNY: invertBaseCNYRates(base), source: 'jsdelivr-currency-api' };
}

/**
 * Fetch from Cloudflare Pages currency-api
 */
async function fetchFromCF() {
  const res = await fetchWithTimeout('https://currency-api.pages.dev/v1/currencies/cny.json', {}, TIMING.FX_FETCH_TIMEOUT_MS);
  const data = await res.json();
  const base = data?.cny || data?.CNY;
  if (!base) throw new Error('currency-api(cf): no cny base');
  return { fxToCNY: invertBaseCNYRates(base), source: 'cf-currency-api' };
}

/**
 * Fetch FX rates from multiple sources (first success wins)
 */
async function fetchAndStoreFx() {
  if (fxInFlight) return;
  fxInFlight = true;
  
  try {
    await chrome.storage.local.set({ 
      [STORAGE_KEYS.FX_FETCHING]: true, 
      [STORAGE_KEYS.FX_FETCH_ERROR]: null 
    });
    
    const tasks = [
      fetchFromFrankfurter(),
      fetchFromERAPI(),
      fetchFromJsDelivr(),
      fetchFromCF()
    ];
    
    let result;
    try {
      result = await Promise.any(tasks);
    } catch {
      throw new Error('All FX sources failed');
    }
    
    const fxToCNY = result.fxToCNY || {};
    if (Object.keys(fxToCNY).length < 3) {
      throw new Error('FX mapping too small');
    }
    
    await chrome.storage.local.set({
      [STORAGE_KEYS.FX_TO_CNY]: fxToCNY,
      [STORAGE_KEYS.FX_LAST_UPDATED]: Date.now(),
      [STORAGE_KEYS.FX_SOURCE]: result.source,
      [STORAGE_KEYS.FX_FETCHING]: false,
      [STORAGE_KEYS.FX_FETCH_ERROR]: null
    });
    
    console.log('[BT] FX updated from', result.source, 'currencies=', Object.keys(fxToCNY).length);
  } catch (err) {
    console.warn('[BT] FX fetch failed', err);
    await chrome.storage.local.set({ 
      [STORAGE_KEYS.FX_FETCHING]: false, 
      [STORAGE_KEYS.FX_FETCH_ERROR]: String(err?.message || err) 
    });
  } finally {
    fxInFlight = false;
  }
}

// ==================== LLM Proxy ====================

/**
 * Proxy LLM request (keeps API key secure)
 */
async function proxyLLMRequest(endpoint, apiKey, body) {
  const isGemini = endpoint.includes('googleapis.com');

  const headers = { 'Content-Type': 'application/json' };

  if (isGemini) {
    // Pass the key via header instead of the query string so it never
    // lands in service-worker request logs / history.
    headers['x-goog-api-key'] = apiKey;
  } else {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  
  return await res.json();
}

/**
 * Test LLM connection
 */
async function testLLM(cfg) {
  const { endpoint, model, api_key } = cfg;
  if (!endpoint || !api_key) {
    return { ok: false, error: 'missing endpoint or key' };
  }
  
  const isGemini = endpoint.includes('googleapis.com');
  
  const body = isGemini ? {
    contents: [{ parts: [{ text: 'Ping. Return JSON: { "text": "ok", "anchor": "ok" }' }] }]
  } : {
    model: model || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'Return strictly JSON: {"text": string, "anchor": string}. Keep it very short.' },
      { role: 'user', content: 'Ping for capability test' }
    ],
    temperature: 0.1
  };
  
  try {
    const data = await proxyLLMRequest(endpoint, api_key, body);
    
    let content = '';
    if (data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      content = data.candidates[0].content.parts[0].text;
    } else if (data?.choices?.[0]?.message?.content) {
      content = data.choices[0].message.content;
    }
    
    let sample = '';
    try {
      const parsed = JSON.parse((content || '').trim());
      sample = parsed?.text ? String(parsed.text).slice(0, 100) : (content || '').slice(0, 60);
    } catch {
      sample = (content || '').slice(0, 60);
    }
    
    return { ok: true, sample };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

/**
 * List available Gemini models
 */
async function listGeminiModels(apiKey) {
  if (!apiKey) return { error: 'Missing API Key' };
  
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
      headers: { 'x-goog-api-key': apiKey }
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${t}`);
    }
    const data = await res.json();
    return { models: data.models || [] };
  } catch (err) {
    return { error: String(err?.message || err) };
  }
}

// ==================== Event Listeners ====================

// Installation / Startup
chrome.runtime.onInstalled.addListener(async () => {
  await fetchAndStoreFx();
  chrome.alarms.create(FX_ALARM, { periodInMinutes: TIMING.FX_REFRESH_MINUTES });
  
  try {
    chrome.contextMenus.create({
      id: 'bt_explain_selection',
      title: chrome.i18n.getMessage('contextMenuExplain') || 'Babel Tower: Explain Selection',
      contexts: ['selection']
    });
  } catch {}
});

chrome.runtime.onStartup.addListener(async () => {
  await fetchAndStoreFx();
  chrome.alarms.create(FX_ALARM, { periodInMinutes: TIMING.FX_REFRESH_MINUTES });
});

// Alarms
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === FX_ALARM) {
    await fetchAndStoreFx();
  }
});

// Message handling
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg?.type) return false;
  
  switch (msg.type) {
    case MSG_TYPES.REFRESH_FX:
      fetchAndStoreFx();
      sendResponse({ accepted: true });
      return false;
    
    case MSG_TYPES.FX_STATUS:
      chrome.storage.local.get([
        STORAGE_KEYS.FX_FETCHING,
        STORAGE_KEYS.FX_LAST_UPDATED,
        STORAGE_KEYS.FX_SOURCE,
        STORAGE_KEYS.FX_FETCH_ERROR
      ], (res) => {
        sendResponse(res || {});
      });
      return true;
    
    case MSG_TYPES.TEST_LLM:
      testLLM(msg.cfg || {}).then(sendResponse);
      return true;
    
    case MSG_TYPES.LIST_MODELS:
      listGeminiModels(msg.api_key).then(sendResponse);
      return true;
    
    case MSG_TYPES.CALL_LLM:
      proxyLLMRequest(msg.endpoint, msg.apiKey, msg.body)
        .then(data => sendResponse({ data }))
        .catch(err => sendResponse({ error: err.message }));
      return true;
    
    case MSG_TYPES.OPEN_OPTIONS:
      chrome.runtime.openOptionsPage();
      sendResponse(true);
      return false;
  }
  
  return false;
});

// Toolbar icon click
chrome.action.onClicked.addListener((tab) => {
  chrome.storage.local.get([STORAGE_KEYS.QUIET_MODE], (res) => {
    if (res?.[STORAGE_KEYS.QUIET_MODE] && tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: MSG_TYPES.ANALYZE_SELECTION });
    } else {
      chrome.runtime.openOptionsPage();
    }
  });
});

// Context menu click
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'bt_explain_selection' && tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      type: MSG_TYPES.ANALYZE_SELECTION,
      text: info.selectionText || ''
    });
  }
});
