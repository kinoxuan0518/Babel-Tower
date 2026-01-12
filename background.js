// Background service worker (MV3)
// - Periodically fetches FX rates and stores them in chrome.storage.local
// - Uses exchangerate.host (no API key) with base=CNY, then inverts to build fxToCNY

const FX_ALARM = 'bt_fx_refresh';
const FX_REFRESH_MINUTES = 240; // 4 hours
const FX_FETCH_TIMEOUT_MS = 8000; // per-source timeout
let fxInFlight = false;

function abortableFetchJSON(url, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort('timeout'), timeoutMs);
  return fetch(url, { cache: 'no-store', signal: ctrl.signal })
    .then(res => { clearTimeout(timer); if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); });
}

function invertBaseCNYRates(rates) {
  // Input: rates[CODE] = amount of CODE per 1 CNY
  // Output: fxToCNY[CODE] = amount of CNY per 1 CODE
  const out = { CNY: 1 };
  for (const [code, val] of Object.entries(rates || {})) {
    const v = Number(val);
    if (Number.isFinite(v) && v > 0) out[String(code).toUpperCase()] = 1 / v;
  }
  return out;
}

async function fetchFromExchangerateHost() {
  const data = await abortableFetchJSON('https://api.exchangerate.host/latest?base=CNY', FX_FETCH_TIMEOUT_MS);
  if (!data || !data.rates) throw new Error('exchangerate.host: no rates');
  return { fxToCNY: invertBaseCNYRates(data.rates), source: 'exchangerate.host' };
}

async function fetchFromFrankfurter() {
  const data = await abortableFetchJSON('https://api.frankfurter.app/latest?from=CNY', FX_FETCH_TIMEOUT_MS);
  if (!data || !data.rates) throw new Error('frankfurter: no rates');
  return { fxToCNY: invertBaseCNYRates(data.rates), source: 'frankfurter.app' };
}

async function fetchFromERAPI() {
  const data = await abortableFetchJSON('https://open.er-api.com/v6/latest/CNY', FX_FETCH_TIMEOUT_MS);
  if (!data || !data.rates) throw new Error('open.er-api: no rates');
  return { fxToCNY: invertBaseCNYRates(data.rates), source: 'open.er-api.com' };
}

async function fetchFromCurrencyAPI_JSDelivr() {
  const data = await abortableFetchJSON('https://cdn.jsdelivr.net/gh/fawazahmed0/currency-api@1/latest/currencies/cny.json', FX_FETCH_TIMEOUT_MS);
  const base = data && (data.cny || data.CNY);
  if (!base) throw new Error('currency-api(jsdelivr): no cny base');
  return { fxToCNY: invertBaseCNYRates(base), source: 'jsdelivr-currency-api' };
}

async function fetchFromCurrencyAPI_CF() {
  const data = await abortableFetchJSON('https://currency-api.pages.dev/v1/currencies/cny.json', FX_FETCH_TIMEOUT_MS);
  const base = data && (data.cny || data.CNY);
  if (!base) throw new Error('currency-api(cf): no cny base');
  return { fxToCNY: invertBaseCNYRates(base), source: 'cf-currency-api' };
}

async function fetchAndStoreFx() {
  if (fxInFlight) return;
  fxInFlight = true;
  try {
    // mark fetching for UI
    await chrome.storage.local.set({ fx_fetching: true, fx_fetch_error: null });
    // race multiple sources; settle on the first success
    const tasks = [
      fetchFromExchangerateHost(),
      fetchFromFrankfurter(),
      fetchFromERAPI(),
      fetchFromCurrencyAPI_JSDelivr(),
      fetchFromCurrencyAPI_CF(),
    ];
    let result;
    try {
      result = await Promise.any(tasks);
    } catch (e) {
      throw new Error('All FX sources failed');
    }
    const fxToCNY = result.fxToCNY || {};
    if (!fxToCNY || Object.keys(fxToCNY).length < 3) throw new Error('FX mapping too small');
    await chrome.storage.local.set({
      fxToCNY,
      fx_lastUpdated: Date.now(),
      fx_source: result.source,
      fx_base: 'CNY',
      fx_fetching: false,
      fx_fetch_error: null
    });
    console.log('Babel Tower: FX updated from', result.source, 'currencies=', Object.keys(fxToCNY).length);
  } catch (err) {
    console.warn('Babel Tower: FX fetch failed', err);
    await chrome.storage.local.set({ fx_fetching: false, fx_fetch_error: String(err && err.message || err) });
  } finally {
    fxInFlight = false;
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  // prime fetch and schedule
  await fetchAndStoreFx();
  chrome.alarms.create(FX_ALARM, { periodInMinutes: FX_REFRESH_MINUTES });
  try { chrome.contextMenus.create({ id: 'bt_explain_selection', title: 'Babel Tower: 解释选中内容', contexts: ['selection'] }); } catch (e) {}
});

chrome.runtime.onStartup.addListener(async () => {
  await fetchAndStoreFx();
  chrome.alarms.create(FX_ALARM, { periodInMinutes: FX_REFRESH_MINUTES });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === FX_ALARM) {
    await fetchAndStoreFx();
  }
});

// Allow options page to trigger an immediate refresh
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'bt_refresh_fx') {
    // Respond immediately to avoid UI waiting; update comes via storage change
    try { sendResponse({ accepted: true }); } catch {}
    fetchAndStoreFx();
    return false;
  }
  if (msg && msg.type === 'bt_open_options') {
    chrome.runtime.openOptionsPage();
    sendResponse(true);
  }
  if (msg && msg.type === 'bt_fx_status') {
    chrome.storage.local.get(['fx_fetching','fx_lastUpdated','fx_source','fx_fetch_error'], (res) => {
      try { sendResponse(res || {}); } catch {}
    });
    return true;
  }
  if (msg && msg.type === 'bt_test_llm') {
    const cfg = (msg && msg.cfg) || {};
    const endpoint = cfg.endpoint;
    const model = cfg.model || 'gpt-4o-mini';
    const api_key = cfg.api_key;
    if (!endpoint || !api_key) { try { sendResponse({ ok: false, error: 'missing endpoint or key' }); } catch {}; return false; }
    const body = {
      model,
      messages: [
        { role: 'system', content: 'Return strictly JSON: {"text": string, "anchor": string}. Keep it very short.' },
        { role: 'user', content: 'Ping for capability test' }
      ],
      temperature: 0.1
    };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort('timeout'), 12000);
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${api_key}` },
      body: JSON.stringify(body),
      signal: ctrl.signal
    }).then(async (res) => {
      clearTimeout(timer);
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        try { sendResponse({ ok: false, error: `HTTP ${res.status}: ${t.slice(0,120)}` }); } catch {}
        return;
      }
      const data = await res.json();
      const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      let sample = '';
      try {
        const parsed = JSON.parse((content || '').trim());
        sample = parsed && parsed.text ? String(parsed.text).slice(0, 100) : (content || '').slice(0, 60);
      } catch (e) {
        sample = (content || '').slice(0, 60);
      }
      try { sendResponse({ ok: true, sample }); } catch {}
    }).catch((err) => {
      clearTimeout(timer);
      try { sendResponse({ ok: false, error: String(err && err.message || err) }); } catch {}
    });
    return true;
  }
});

// Clicking the toolbar icon: if quiet mode, analyze selection; else open options
chrome.action.onClicked.addListener((tab) => {
  chrome.storage.local.get(['bt_quiet_mode'], (res) => {
    if (res && res.bt_quiet_mode && tab && tab.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'bt_analyze_selection' });
    } else {
      chrome.runtime.openOptionsPage();
    }
  });
});

// Context menu click
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'bt_explain_selection' && tab && tab.id) {
    const text = info.selectionText || '';
    chrome.tabs.sendMessage(tab.id, { type: 'bt_analyze_selection', text });
  }
});
