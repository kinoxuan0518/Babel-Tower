/**
 * Babel Tower - Content Script (MV3)
 *
 * 功能
 * - 监听选中文本（mouseup）
 * - 识别价格样式（$19.99 / 19.99 USD 等）
 * - 从 profile.json 加载用户上下文与锚点
 * - 优先调用 LLM（当配置存在），否则回退到启发式计算
 * - 在页面上渲染解释卡片 Overlay
 *
 * 说明
 * - 要启用 LLM：在 profile.json 添加 llm 配置（示例见下）
 *   {
 *     "llm": {
 *       "provider": "openai",
 *       "endpoint": "https://api.openai.com/v1/chat/completions",
 *       "api_key": "YOUR_API_KEY",
 *       "model": "gpt-4o-mini"
 *     }
 *   }
 * - 注意：在内容脚本直接请求第三方 API 可能遇到 CORS/密钥泄露风险。
 *   更推荐将网络请求转发到扩展 Service Worker，再由其请求外部 API。
 */

// -------------------- 状态 --------------------
if (window.__BT_RUNNING) {
  console.debug('Babel Tower: content script already running, skip init');
} else {
  window.__BT_RUNNING = true;
  console.debug('Babel Tower: content script loaded (v0.1.0)');
}
let currentOverlay = null;
let userProfile = null;
let lastRequestId = 0; // 用于避免竞态条件（后发先至）
let fxLoaded = false;
let overrideTargetCurrency = null;
let customAnchorUnit = null; // { name, cost, currency }
let explainEnabled = true;
let explainLang = 'zh';
let llmOverride = null; // { endpoint, model, api_key }
let userPhysical = null; // { height_cm, weight_kg, foot_length_cm, preferred_fit }
let llmPrefer = true;
let quietMode = true;
let pageContext = null;
let pageIntent = null; // { category, user_goal }
let showTranslation = true;

// -------------------- Profile 加载 --------------------
async function loadProfile() {
  try {
    const url = chrome.runtime.getURL('profile.json');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    userProfile = await res.json();
    console.log('Babel Tower: Profile loaded.');
  } catch (err) {
    console.error('Babel Tower: Failed to load profile.json', err);
    userProfile = null;
  }
}
loadProfile();

// 从 storage 加载实时汇率映射（fxToCNY）
function loadFxFromStorageAndSettings() {
  try {
    chrome.storage.local.get(['fxToCNY','bt_targetCurrency','bt_anchor_unit','bt_explain_enabled','bt_explain_lang','bt_llm','bt_user_physical','bt_llm_prefer','bt_quiet_mode','bt_show_translation'], (res) => {
      if (res && res.fxToCNY) {
        userProfile = userProfile || {};
        userProfile.fx = Object.assign({}, userProfile.fx || {}, res.fxToCNY);
        fxLoaded = true;
        console.log('Babel Tower: FX loaded from storage');
      }
      if (res && res.bt_targetCurrency) {
        overrideTargetCurrency = String(res.bt_targetCurrency).toUpperCase();
        console.log('Babel Tower: Target currency override =', overrideTargetCurrency);
      }
      if (res && res.bt_anchor_unit) {
        customAnchorUnit = res.bt_anchor_unit;
        console.log('Babel Tower: Custom anchor loaded');
      }
      if (typeof res.bt_explain_enabled === 'boolean') explainEnabled = res.bt_explain_enabled;
      if (res.bt_explain_lang) explainLang = String(res.bt_explain_lang);
      if (res && res.bt_llm) {
        llmOverride = res.bt_llm;
        console.log('Babel Tower: LLM override loaded');
      }
      if (res && res.bt_user_physical) {
        userPhysical = res.bt_user_physical;
        console.log('Babel Tower: User physical loaded');
      }
      if (typeof res.bt_llm_prefer === 'boolean') llmPrefer = res.bt_llm_prefer;
      if (typeof res.bt_quiet_mode === 'boolean') quietMode = res.bt_quiet_mode;
      if (typeof res.bt_show_translation === 'boolean') showTranslation = res.bt_show_translation;
    });
  } catch (e) {
    // ignore if storage not available yet
  }
}
loadFxFromStorageAndSettings();
gatherPageContext();

// 实时监听 FX 更新
try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.fxToCNY) {
      userProfile = userProfile || {};
      userProfile.fx = Object.assign({}, userProfile.fx || {}, changes.fxToCNY.newValue || {});
      fxLoaded = true;
      console.log('Babel Tower: FX updated via storage change');
    }
    if (area === 'local' && changes.bt_targetCurrency) {
      overrideTargetCurrency = (changes.bt_targetCurrency.newValue || '').toUpperCase() || null;
      console.log('Babel Tower: Target currency changed =', overrideTargetCurrency);
    }
    if (area === 'local' && changes.bt_anchor_unit) {
      customAnchorUnit = changes.bt_anchor_unit.newValue || null;
      console.log('Babel Tower: Custom anchor changed');
    }
    if (area === 'local' && changes.bt_explain_enabled) {
      explainEnabled = !!changes.bt_explain_enabled.newValue;
    }
    if (area === 'local' && changes.bt_explain_lang) {
      explainLang = String(changes.bt_explain_lang.newValue || 'zh');
    }
    if (area === 'local' && changes.bt_llm) {
      llmOverride = changes.bt_llm.newValue || null;
      console.log('Babel Tower: LLM override changed');
    }
    if (area === 'local' && changes.bt_user_physical) {
      userPhysical = changes.bt_user_physical.newValue || null;
      console.log('Babel Tower: User physical changed');
    }
    if (area === 'local' && changes.bt_llm_prefer) {
      llmPrefer = !!changes.bt_llm_prefer.newValue;
    }
    if (area === 'local' && changes.bt_quiet_mode) {
      quietMode = !!changes.bt_quiet_mode.newValue;
    }
    if (area === 'local' && changes.bt_show_translation) {
      showTranslation = !!changes.bt_show_translation.newValue;
    }
  });
} catch (e) {
  // ignore in case chrome.storage not available
}

// -------------------- 事件监听 --------------------
const handleSelectionEvent = async (event) => {
  const selection = window.getSelection();
  const selectedText = selection ? selection.toString().trim() : '';
  console.log('Babel Tower: selection text =', selectedText);

  if (!selectedText) {
    removeOverlay();
    return;
  }
  if (selectedText.length < 2) return;

  const { x, y } = getSelectionCoordinates(event);
  console.debug('Babel Tower: overlay coords =', x, y);

  // 显示占位 Overlay
  showOverlay(x, y, {
    original: selectedText,
    insight: 'Analyzing…',
    anchor: 'Hold on a sec'
  });

  const requestId = ++lastRequestId;
  try {
    const price = extractPrice(selectedText);
    const useLLM = hasLLM();

    let result;
    const sizeCtx = parseSizeContext(selectedText);
    const feat = isFeatureSelection(selectedText);
    if (price && Number.isFinite(price.amount)) {
      // 价格场景：默认使用启发式（更快更稳），无需 LLM
      result = generateHeuristic(price.amount, price.currency);
      if (useLLM) {
        result.translation = await generateTranslationWithLLM(selectedText, explainLang);
      }
    } else if (feat) {
      if (useLLM) {
        result = await generateCognitiveWithLLM({ selectedText, task: 'feature', price: null, sizeCtx: null, lang: explainLang });
      } else {
        result = { text: '需要启用 LLM 才能解释此特性', anchor: '' };
      }
    } else if (sizeCtx && sizeCtx.kind === 'pack') {
      if (isPackDimsNotHelpful()) { removeOverlay(); return; }
      if (useLLM && llmPrefer) {
        result = await generateCognitiveWithLLM({ selectedText, task: 'size', price: null, sizeCtx, lang: explainLang });
      } else {
        result = generatePackHeuristic(sizeCtx);
        if (useLLM) result.translation = await generateTranslationWithLLM(selectedText, explainLang);
      }
    } else if (sizeCtx) {
      if (useLLM && llmPrefer) {
        result = await generateCognitiveWithLLM({ selectedText, task: 'size', price: null, sizeCtx, lang: explainLang });
      } else {
        result = generateSizeHeuristic(sizeCtx);
        if (useLLM) result.translation = await generateTranslationWithLLM(selectedText, explainLang);
      }
    } else if (explainEnabled && shouldExplain(selectedText)) {
      if (useLLM) {
        result = await generateCognitiveWithLLM({ selectedText, task: 'term', price: null, sizeCtx: null, lang: explainLang });
      } else {
        result = { text: '需要启用 LLM 才能进行名词解释', anchor: '' };
      }
    } else {
      removeOverlay();
      return;
    }

    // 若期间产生了新请求，则忽略旧请求结果
    if (requestId !== lastRequestId) return;

    // 更新 Overlay
    updateOverlay({ original: selectedText, insight: result.text, anchor: result.anchor, translation: result.translation || '' });
  } catch (err) {
    console.error('Babel Tower: analyze failed', err);
    if (requestId === lastRequestId) {
      updateOverlay({
        original: selectedText,
        insight: 'Sorry, something went wrong.',
        anchor: ''
      });
    }
  }
};

document.addEventListener('mouseup', (e) => { if (!quietMode) handleSelectionEvent(e); }, true);
document.addEventListener('touchend', (e) => { if (!quietMode) handleSelectionEvent(e); }, true);

// 有些站点仅 keyboard 选区，使用 selectionchange 兜底（延时读取坐标）
document.addEventListener('selectionchange', () => {
  // 轻量防抖
  clearTimeout(window.__bt_sel_t);
  window.__bt_sel_t = setTimeout(() => {
    const sel = window.getSelection();
    const text = sel ? sel.toString().trim() : '';
    if (!quietMode && text && text.length >= 2) {
      handleSelectionEvent({});
    }
  }, 120);
});

// Listen for explicit analyze command (from context menu / toolbar)
try {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'bt_analyze_selection') {
      const text = (msg.text || '').trim();
      const sel = window.getSelection();
      const fallbackText = sel ? sel.toString().trim() : '';
      const useText = text || fallbackText;
      if (!useText) return;
      const coords = getSelectionCoordinates({});
      analyzeTextAt(useText, coords.x, coords.y).catch(() => {});
    }
  });
} catch {}

async function analyzeTextAt(selectedText, x, y) {
  showOverlay(x, y, { original: selectedText, insight: 'Analyzing…', anchor: 'Hold on a sec' });
  const requestId = ++lastRequestId;
  try {
    const price = extractPrice(selectedText);
    const sizeCtx = parseSizeContext(selectedText);
    const useLLM = hasLLM();
    const feat = isFeatureSelection(selectedText);
    let result;
    if (price && Number.isFinite(price.amount)) {
      // 价格场景：默认使用启发式（更快更稳），无需 LLM
      result = generateHeuristic(price.amount, price.currency);
    } else if (feat) {
      if (useLLM) {
        result = await generateCognitiveWithLLM({ selectedText, task: 'feature', price: null, sizeCtx: null, lang: explainLang });
      } else {
        result = { text: '需要启用 LLM 才能解释此特性', anchor: '' };
      }
    } else if (sizeCtx && sizeCtx.kind === 'pack') {
      if (isGarmentContext()) {
        removeOverlay();
        return;
      }
      if (useLLM && llmPrefer) {
        result = await generateCognitiveWithLLM({ selectedText, task: 'size', price: null, sizeCtx, lang: explainLang });
      } else {
        result = generatePackHeuristic(sizeCtx);
      }
    } else if (sizeCtx) {
      if (useLLM && llmPrefer) {
        result = await generateCognitiveWithLLM({ selectedText, task: 'size', price: null, sizeCtx, lang: explainLang });
      } else {
        result = generateSizeHeuristic(sizeCtx);
      }
    } else if (explainEnabled && shouldExplain(selectedText)) {
      if (useLLM) {
        result = await generateCognitiveWithLLM({ selectedText, task: 'term', price: null, sizeCtx: null, lang: explainLang });
      } else {
        result = { text: '需要启用 LLM 才能进行名词解释', anchor: '' };
      }
    } else {
      removeOverlay();
      return;
    }
    if (requestId !== lastRequestId) return;
    updateOverlay({ original: selectedText, insight: result.text, anchor: result.anchor });
  } catch (err) {
    if (requestId === lastRequestId) updateOverlay({ original: selectedText, insight: 'Sorry, something went wrong.', anchor: '' });
  }
}

function gatherPageContext() {
  try {
    const lang = (document.documentElement.lang || navigator.language || '').toLowerCase();
    const title = document.title || '';
    const host = location.host || '';
    let ogType = '', siteName = '', canonical = '';
    const metas = document.getElementsByTagName('meta');
    for (const m of metas) {
      const p = (m.getAttribute('property') || m.getAttribute('name') || '').toLowerCase();
      if (p === 'og:type') ogType = m.getAttribute('content') || ogType;
      if (p === 'og:site_name') siteName = m.getAttribute('content') || siteName;
    }
    const links = document.getElementsByTagName('link');
    for (const l of links) {
      const rel = (l.getAttribute('rel') || '').toLowerCase();
      if (rel === 'canonical') canonical = l.getAttribute('href') || canonical;
    }
    // schema.org detection
    let schema = '';
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const s of scripts) {
      try {
        const json = JSON.parse(s.textContent || '{}');
        const t = Array.isArray(json) ? json.map(x=>x['@type']).join(',') : (json['@type'] || '');
        if (t && /Product|Offer/i.test(t)) { schema = t; break; }
      } catch {}
    }
    pageContext = { lang, title, host, ogType, siteName, canonical, schema };
    pageIntent = classifyPageIntentHeuristic();
    // If heuristic is uncertain, try micro LLM classification once and cache
    classifyPageIntentSmart();
  } catch {}
}

function classifyPageIntentHeuristic() {
  try {
    const t = (pageContext?.title || document.title || '').toLowerCase();
    const schema = (pageContext?.schema || '').toLowerCase();
    let category = 'other';
    if (/(protein|whey|casein|supplement|bcaa|creatine|蛋白|乳清|酪蛋白|增肌|补剂)/.test(t)) category = 'supplement';
    else if (/(speaker|soundbar|bluetooth|anc|audio|headphone|音箱|耳机|降噪)/.test(t)) category = 'audio';
    else if (/(jacket|coat|shirt|pant|jean|skirt|dress|hoodie|down|outer|羽绒|外套|衣|上衣|裤|裙)/.test(t)) category = 'clothing';
    else if (/(desk|table|chair|sofa|furniture|家具|书桌|桌|椅)/.test(t)) category = 'furniture';
    else if (/(laptop|monitor|phone|camera|electronics|电子|显示器|相机|手机)/.test(t)) category = 'electronics';
    const user_goal = /product|offer/.test(schema) ? 'buying' : 'reading';
    return { category, user_goal };
  } catch {}
  return { category: 'other', user_goal: 'reading' };
}

function intentCacheKey() {
  try {
    const host = location.host || '';
    const path = (location.pathname || '').split('/').slice(0,2).join('/');
    return `${host}${path}`;
  } catch { return String(Date.now()); }
}

function classifyPageIntentSmart() {
  try {
    if (!hasLLM()) return; // no LLM, skip
    if (!pageIntent || pageIntent.category === 'other') {
      const key = intentCacheKey();
      chrome.storage.local.get(['bt_page_intent_cache'], async (res) => {
        const cache = res.bt_page_intent_cache || {};
        if (cache[key]) { pageIntent = cache[key]; return; }
        try {
          const intent = await classifyPageIntentLLM();
          if (intent && intent.category) {
            pageIntent = intent;
            // store back
            const next = Object.assign({}, cache);
            next[key] = intent;
            // simple cap to 50 entries
            const keys = Object.keys(next);
            if (keys.length > 50) delete next[keys[0]];
            chrome.storage.local.set({ bt_page_intent_cache: next });
          }
        } catch {}
      });
    }
  } catch {}
}

async function classifyPageIntentLLM() {
  const cfg = getLLMCfg();
  if (!cfg.endpoint || !cfg.api_key) throw new Error('LLM config missing');
  const ctx = {
    title: pageContext?.title || document.title || '',
    host: pageContext?.host || location.host || '',
    ogType: pageContext?.ogType || '',
    siteName: pageContext?.siteName || '',
    canonical: pageContext?.canonical || ''
  };
  const sys = [
    'Classify page intent for end-user shopping context.',
    'Return strictly JSON: {"category": string, "user_goal": string}.',
    'category in {supplement,audio,clothing,furniture,electronics,other}.',
    'user_goal in {buying,reading}. Keep it minimal.'
  ].join(' ');
  const messages = [
    { role: 'system', content: sys },
    { role: 'user', content: JSON.stringify(ctx) }
  ];
  const body = { model: cfg.model || 'gpt-4o-mini', messages, temperature: 0 };
  const res = await fetch(cfg.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.api_key}` }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error('intent http');
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content?.trim?.();
  let parsed; try { parsed = JSON.parse(content); } catch (e) { const m = content && content.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); }
  if (!parsed || !parsed.category) return null;
  return { category: String(parsed.category), user_goal: String(parsed.user_goal || 'buying') };
}

function getSelectionCoordinates(event) {
  // 优先使用事件坐标
  const ex = Number.isFinite(event?.pageX) ? event.pageX : null;
  const ey = Number.isFinite(event?.pageY) ? event.pageY : null;
  if (ex != null && ey != null) return { x: ex, y: ey };

  // 回退：用选区的 bounding rect
  try {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect) {
        const x = Math.round(rect.left + window.scrollX);
        const y = Math.round(rect.bottom + window.scrollY);
        return { x, y };
      }
    }
  } catch {}
  // 最后回退到视口左上角
  return { x: 16 + window.scrollX, y: 16 + window.scrollY };
}

// -------------------- 解析价格 --------------------
function extractPrice(text) {
  // 统一处理空白与 NBSP
  const s = String(text).replace(/\u00A0/g, ' ').trim();

  // 数字片段：支持 1,234.56 / 1.234,56 / 1 234,56 / 199,- / 19.99
  const NUM = "(?<num>(?:[0-9]{1,3}(?:[\\s.,'][0-9]{3})+|[0-9]+)(?:[.,][0-9]{1,2})?|[0-9]+(?:,-)?)";

  // 货币记号（符号、地区前缀、三字母代码、部分本地缩写）
  const TOK = [
    // 前缀化 $ 变体
    'US\\$', 'CA\\$', 'AU\\$', 'NZ\\$', 'HK\\$', 'NT\\$', 'S\\$', 'SG\\$', 'MX\\$', 'AR\\$', 'R\\$', 'C\\$', 'U\\$S',
    // 唯一符号
    '€', '£', '¥', '₩', '₫', '฿', '₱', '₽', '₺', '₪', '₴', '₦', '₹', '₵', '₭', '₮', '₼', '₾', '֏', '₸', '₡', 'Q',
    // 常见本地缩写/词
    'zł', 'Kč', 'kr', 'Ft', 'lei', 'лв', 'ден', 'KM', 'Fr\\.?', 'S/\\.?', 'Bs\\.?', 'Dh', 'KSh', 'TSh', 'USh', 'Rs\\.?', 'RM', 'MT', 'Lek',
    // 三字母代码（常见 + 拉美/非中东更多覆盖）
    'USD','EUR','GBP','CNY','RMB','JPY','KRW','HKD','TWD','SGD','AUD','NZD','CAD','CHF','SEK','NOK','DKK','PLN','CZK','HUF','TRY','RUB','INR','IDR','MYR','THB','VND','PHP','BRL','MXN','ZAR','AED','SAR','QAR','OMR','BHD','KWD','ILS','UAH','RON','BGN','GEL','AMD','AZN','KZT','ARS','CLP','COP','PEN','UYU','DOP','CRC','GTQ','PYG','VES','BOB','NGN','EGP','MAD','NPR','LKR','PKR','BDT','GHS','LAK','MNT','KGS','UZS','TJS','BAM','RSD','MKD','HRK','ALL','DZD','TND','LYD','LBP','YER','IRR'
  ].join('|');

  const tokenBefore = new RegExp(`(?<tok>${TOK})\\s*${NUM}`, 'iu');
  const tokenAfter = new RegExp(`${NUM}\\s*(?<tok>${TOK})`, 'iu');

  let m = s.match(tokenBefore) || s.match(tokenAfter);
  if (!m) return null;

  const groups = m.groups || {};
  const token = groups.tok;
  const numText = groups.num;

  const amount = parseLocalizedNumber(numText);
  if (!Number.isFinite(amount)) return null;

  let currency = mapTokenToCurrency(token);
  // 处理含糊记号
  if (!currency || currency === 'AMBIGUOUS') {
    currency = resolveAmbiguousToken(token) || 'USD';
  }
  if (currency === 'RMB') currency = 'CNY';

  return { amount, currency };
}

function parseLocalizedNumber(numText) {
  let s = String(numText).trim();
  // 去掉货币风格结尾 "-,"
  s = s.replace(/,-$/, '');
  const hasDot = s.includes('.');
  const hasComma = s.includes(',');

  // 保留原串用于判断最后一个分隔符
  const original = s;
  // 去除空格和撇号等作为千分位分隔符
  s = s.replace(/[\s'\u00A0]/g, '');

  if (hasDot && hasComma) {
    // 1.234,56 或 1,234.56：以最后出现的分隔符作为小数点
    const lastComma = original.lastIndexOf(',');
    const lastDot = original.lastIndexOf('.');
    const decimalChar = lastComma > lastDot ? ',' : '.';
    const thousandsChar = decimalChar === ',' ? '.' : ',';
    s = s.replace(new RegExp(`\\${thousandsChar}`, 'g'), '');
    s = s.replace(decimalChar, '.');
  } else if (hasComma) {
    // 若逗号后为 1-2 位，视为小数，否则视为千分位
    const parts = s.split(',');
    if (parts.length === 2 && parts[1].length > 0 && parts[1].length <= 2) {
      s = parts[0].replace(/\./g, '') + '.' + parts[1];
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasDot) {
    // 若点后为 1-2 位，视为小数，否则视为千分位
    const parts = s.split('.');
    if (parts.length === 2 && parts[1].length > 0 && parts[1].length <= 2) {
      s = parts[0].replace(/,/g, '') + '.' + parts[1];
    } else {
      s = s.replace(/\./g, '');
    }
  }

  const val = parseFloat(s);
  return Number.isFinite(val) ? val : NaN;
}

function mapTokenToCurrency(token) {
  const t = (token || '').toUpperCase();
  // 直接三字母代码
  const direct = {
    USD:'USD', EUR:'EUR', GBP:'GBP', CNY:'CNY', RMB:'CNY', JPY:'JPY', KRW:'KRW', HKD:'HKD', TWD:'TWD', SGD:'SGD', AUD:'AUD', NZD:'NZD', CAD:'CAD', CHF:'CHF', SEK:'SEK', NOK:'NOK', DKK:'DKK', PLN:'PLN', CZK:'CZK', HUF:'HUF', TRY:'TRY', RUB:'RUB', INR:'INR', IDR:'IDR', MYR:'MYR', THB:'THB', VND:'VND', PHP:'PHP', BRL:'BRL', MXN:'MXN', ZAR:'ZAR', AED:'AED', SAR:'SAR', QAR:'QAR', OMR:'OMR', BHD:'BHD', KWD:'KWD', ILS:'ILS', UAH:'UAH', RON:'RON', BGN:'BGN', GEL:'GEL', AMD:'AMD', AZN:'AZN', KZT:'KZT', ARS:'ARS', CLP:'CLP', COP:'COP', PEN:'PEN', UYU:'UYU', DOP:'DOP', CRC:'CRC', GTQ:'GTQ', PYG:'PYG', VES:'VES', BOB:'BOB', NGN:'NGN', EGP:'EGP', MAD:'MAD', NPR:'NPR', LKR:'LKR', PKR:'PKR', BDT:'BDT', GHS:'GHS', LAK:'LAK', MNT:'MNT', BAM:'BAM', RSD:'RSD', MKD:'MKD', HRK:'HRK', ALL:'ALL', DZD:'DZD', TND:'TND', LYD:'LYD', LBP:'LBP', YER:'YER', IRR:'IRR'
  };
  if (direct[t]) return direct[t];

  // 多字符前缀与缩写
  const map = {
    'HK$':'HKD','NT$':'TWD','S$':'SGD','SG$':'SGD','A$':'AUD','AU$':'AUD','C$':'CAD','CA$':'CAD','NZ$':'NZD','R$':'BRL','MX$':'MXN','AR$':'ARS','US$':'USD','U$S':'UYU','S/.':'PEN','S/':'PEN','RD$':'DOP','BS.':'VES','BS':'VES','KSH':'KES','TSH':'TZS','USH':'UGX','Q':'GTQ','Q.':'GTQ'
  };
  if (map[t]) return map[t];
  if (map[token]) return map[token]; // 保留大小写原样匹配

  // 唯一符号
  const sym = {
    '€':'EUR','£':'GBP','₹':'INR','₩':'KRW','₫':'VND','฿':'THB','₱':'PHP','₽':'RUB','₺':'TRY','₪':'ILS','₴':'UAH','₦':'NGN','₵':'GHS','₭':'LAK','₮':'MNT','₼':'AZN','₾':'GEL','֏':'AMD','₸':'KZT','₡':'CRC'
  };
  if (sym[token]) return sym[token];

  // 文本标记
  if (token === 'zł') return 'PLN';
  if (token === 'Kč') return 'CZK';
  if (token === 'Ft') return 'HUF';
  if (token.toLowerCase() === 'lei') return 'RON';
  if (token === 'лв') return 'BGN';
  if (token === 'ден') return 'MKD';
  if (token === 'KM') return 'BAM';
  if (token.toLowerCase() === 'dh') return 'MAD';
  if (token === 'RM') return 'MYR';
  if (token === 'MT') return 'MZN'; // 可能冲突，默认 MZN
  if (token === 'Lek') return 'ALL';

  // 含糊
  if (token === '$' || token === '¥' || token.toLowerCase() === 'kr' || token === 'Fr.' || token === 'Fr' || token === 'R' || token === 'Rs.' || token === 'Rs') {
    return 'AMBIGUOUS';
  }

  return null;
}

function resolveAmbiguousToken(token) {
  const lang = (document.documentElement.lang || navigator.language || '').toLowerCase();
  const region = (lang.split('-')[1] || '').toUpperCase();
  const tld = (location.hostname.split('.').pop() || '').toUpperCase();

  // ¥: 优先日本站与 ja 语言
  if (token === '¥') {
    if (region === 'JP' || lang.startsWith('ja') || tld === 'JP') return 'JPY';
    if (region === 'CN' || lang.startsWith('zh') || tld === 'CN') return 'CNY';
    return 'CNY';
  }

  // $: 根据区域推测
  if (token === '$') {
    if (region === 'CA' || tld === 'CA') return 'CAD';
    if (region === 'AU' || tld === 'AU') return 'AUD';
    if (region === 'NZ' || tld === 'NZ') return 'NZD';
    if (region === 'SG' || tld === 'SG') return 'SGD';
    if (region === 'HK' || tld === 'HK') return 'HKD';
    if (region === 'MX' || tld === 'MX') return 'MXN';
    if (region === 'AR' || tld === 'AR') return 'ARS';
    if (region === 'BR' || tld === 'BR') return 'BRL';
    if (region === 'UY' || tld === 'UY') return 'UYU';
    return 'USD';
  }

  // Rs / ₨: 印巴南亚
  if (token === 'Rs' || token === 'Rs.' || token === '₨') {
    if (region === 'PK' || tld === 'PK') return 'PKR';
    if (region === 'LK' || tld === 'LK') return 'LKR';
    if (region === 'NP' || tld === 'NP') return 'NPR';
    return 'INR';
  }

  // kr: 北欧
  if (token.toLowerCase() === 'kr') {
    if (region === 'SE' || lang.startsWith('sv') || tld === 'SE') return 'SEK';
    if (region === 'NO' || lang.startsWith('no') || lang.startsWith('nb') || lang.startsWith('nn') || tld === 'NO') return 'NOK';
    if (region === 'DK' || lang.startsWith('da') || tld === 'DK') return 'DKK';
    return 'SEK';
  }

  // R（南非兰特）
  if (token === 'R') {
    if (region === 'ZA' || tld === 'ZA') return 'ZAR';
  }

  // Fr: CHF/非洲法郎/XPF
  if (token === 'Fr.' || token === 'Fr') {
    if (tld === 'PF') return 'XPF';
    const xofTLD = ['SN','CI','BF','BJ','ML','NE','TG','GW'];
    const xafTLD = ['CM','GA','CG','TD','GQ','CF'];
    if (xofTLD.includes(tld)) return 'XOF';
    if (xafTLD.includes(tld)) return 'XAF';
    if (tld === 'RW') return 'RWF';
    if (tld === 'BI') return 'BIF';
    if (tld === 'CD') return 'CDF';
    return 'CHF';
  }

  // Bs: 玻利维亚/委内瑞拉
  if (token === 'Bs' || token === 'Bs.') {
    if (tld === 'VE') return 'VES';
    if (tld === 'BO') return 'BOB';
    return 'VES';
  }

  // Sh: 东非先令
  if (token === 'Sh') {
    if (tld === 'KE') return 'KES';
    if (tld === 'TZ') return 'TZS';
    if (tld === 'UG') return 'UGX';
  }

  return null;
}

// -------------------- 启发式（无 LLM 回退）--------------------
function generateHeuristic(amount, fromCurrency = 'USD') {
  const targetCurrency = (overrideTargetCurrency || userProfile?.user_context?.currency || 'CNY').toUpperCase();
  const fxToCNY = Object.assign({
    // 近似值，仅示例用途；可在 profile.json 的 fx 中覆盖
    USD: 7.2, EUR: 7.8, GBP: 9.2, CNY: 1,
    JPY: 0.05, KRW: 0.0053, HKD: 0.92, TWD: 0.23, SGD: 5.3,
    AUD: 4.7, NZD: 4.3, CAD: 5.2, CHF: 8.3, SEK: 0.7, NOK: 0.66, DKK: 1.05,
    PLN: 1.9, CZK: 0.31, HUF: 0.02, TRY: 0.23, RUB: 0.08, INR: 0.086,
    IDR: 0.00046, MYR: 1.5, THB: 0.20, VND: 0.00029, PHP: 0.13,
    BRL: 1.4, MXN: 0.42, ZAR: 0.38, AED: 1.96, SAR: 1.92, QAR: 1.98, OMR: 18.7,
    BHD: 19.1, KWD: 23.3, ILS: 1.93, UAH: 0.18, RON: 1.57, BGN: 3.99,
    GEL: 2.62, AMD: 0.019, AZN: 4.24, KZT: 0.016, ARS: 0.008, CLP: 0.008,
    COP: 0.0018, PEN: 1.93, UYU: 0.18, DOP: 0.12, CRC: 0.014, GTQ: 0.93,
    PYG: 0.0010, VES: 2.0, BOB: 1.04, NGN: 0.0059, EGP: 0.15, MAD: 0.72,
    NPR: 0.055, LKR: 0.024, PKR: 0.026, BDT: 0.061, GHS: 0.49, LAK: 0.00034,
    MNT: 0.0021, BAM: 4.0, RSD: 0.067, MKD: 0.13, HRK: 1.03, ALL: 0.079,
    DZD: 0.053, TND: 2.3, LYD: 1.47, LBP: 0.0005, YER: 0.029, IRR: 0.000017
  }, userProfile?.fx || {});

  const norm = (c) => (c || '').toUpperCase() === 'RMB' ? 'CNY' : (c || '').toUpperCase();
  const from = norm(fromCurrency);
  const to = norm(targetCurrency);

  let valueInTarget = amount;
  if (from !== to) {
    // 通过 CNY 作为中间货币换算
    const fromToCNY = fxToCNY[from];
    const toToCNY = fxToCNY[to];
    if (fromToCNY && toToCNY) {
      const inCNY = amount * fromToCNY;
      valueInTarget = to === 'CNY' ? inCNY : (inCNY / toToCNY);
    }
  }

  const coffeeCost = userProfile?.cognitive_anchors?.coffee_benchmark?.cost ?? 15;
  const subsCost = userProfile?.cognitive_anchors?.subscription_benchmark?.cost ?? 25;
  const coffeeName = userProfile?.cognitive_anchors?.coffee_benchmark?.name ?? '咖啡';
  const subsName = userProfile?.cognitive_anchors?.subscription_benchmark?.name ?? '订阅';

  const mainText = `${to} ${valueInTarget.toFixed(1)}`;
  let anchorText = '';
  // Prefer custom anchor if available
  const customText = tryCustomAnchorAnchorText(valueInTarget, to, fxToCNY);
  if (customText) {
    anchorText = customText;
  } else if (to === 'CNY' && coffeeCost > 0 && valueInTarget < 50) {
    const cups = (valueInTarget / coffeeCost).toFixed(1);
    anchorText = `约等于 ${cups} ${coffeeName}`;
  } else if (to === 'CNY' && subsCost > 0) {
    const months = (valueInTarget / subsCost).toFixed(1);
    anchorText = `约等于 ${months} ${subsName}`;
  }

  return { text: mainText, anchor: anchorText };
}

function tryCustomAnchorAnchorText(valueInTarget, targetCurrency, fxToCNY) {
  if (!customAnchorUnit || !customAnchorUnit.name) return '';
  let cost = Number(customAnchorUnit.cost);
  if (!Number.isFinite(cost) || cost <= 0) return '';
  const name = customAnchorUnit.name;
  let costCurrency = String(customAnchorUnit.currency || targetCurrency).toUpperCase();
  // Convert anchor cost to target currency if needed using fxToCNY
  if (costCurrency !== targetCurrency) {
    const srcToCNY = fxToCNY[costCurrency];
    const tgtToCNY = fxToCNY[targetCurrency];
    if (srcToCNY && tgtToCNY) {
      const costInCNY = cost * srcToCNY;
      cost = costInCNY / tgtToCNY;
      costCurrency = targetCurrency;
    } else {
      // cannot convert; avoid misleading result
      return '';
    }
  }
  if (cost <= 0) return '';
  const units = valueInTarget / cost;
  const unitsText = units < 10 ? units.toFixed(1) : Math.round(units).toString();
  const costText = `${targetCurrency} ${cost.toFixed(2)}`;
  return `约等于 ${unitsText} ${name}（1 ${name} ≈ ${costText}）`;
}

// -------------------- LLM 接入（OpenAI 风格）--------------------
async function generateWithLLM(selectedText, priceUSD) {
  const cfg = getLLMCfg();
  if (!cfg.endpoint || !cfg.api_key) {
    throw new Error('LLM config missing.');
  }

  // 构造 Prompt：要求返回严格 JSON
  const userPayload = {
    selectedText,
    priceUSD,
    user_context: userProfile?.user_context ?? {},
    cognitive_anchors: userProfile?.cognitive_anchors ?? {},
    system_rules: userProfile?.system_rules ?? {}
  };

  const messages = [
    {
      role: 'system',
      content: [
        'You are Babel Tower, a cognitive translation layer.',
        'Given the user context and selected text (often a price),',
        'output a concise JSON with fields: {"text": string, "anchor": string}.',
        'text: the primary localized insight (e.g., CNY converted or key takeaway).',
        'anchor: a cognitive anchor using provided benchmarks.',
        'Respond with JSON only, no extra text.'
      ].join(' ')
    },
    {
      role: 'user',
      content: JSON.stringify(userPayload)
    }
  ];

  const body = {
    model: cfg.model || 'gpt-4o-mini',
    messages,
    temperature: 0.2
  };

  const res = await fetch(cfg.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.api_key}`
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`LLM HTTP ${res.status}: ${t}`);
  }

  const data = await res.json();
  // 兼容 OpenAI /v1/chat/completions 响应
  const content = data?.choices?.[0]?.message?.content?.trim?.();

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    // 尝试提取 JSON（若模型带了前后文）
    const jsonMatch = content && content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    }
  }

  if (!parsed || typeof parsed.text !== 'string') {
    throw new Error('LLM response parse error');
  }

  return { text: parsed.text, anchor: parsed.anchor || '' };
}

// -------------------- 名词解释（LLM） --------------------
async function generateExplanationWithLLM(selectedText) {
  const cfg = getLLMCfg();
  if (!cfg.endpoint || !cfg.api_key) {
    throw new Error('LLM config missing.');
  }
  const lang = explainLang || 'zh';
  const sys = [
    'You are Babel Tower, a concise term explainer.',
    'Explain the given term in 1-2 sentences, avoid fluff.',
    'Audience is a Chinese developer; keep it practical and clear.',
    'Return JSON only: {"text": string, "anchor": string}.',
    'text: short definition in desired language; anchor: a usage hint or common pitfall.'
  ].join(' ');
  const langHint = lang === 'en' ? 'English only.' : (lang === 'zh-en' ? 'Bilingual Chinese and English.' : 'Chinese only.');

  const messages = [
    { role: 'system', content: `${sys} Language: ${langHint}` },
    { role: 'user', content: JSON.stringify({ term: selectedText }) }
  ];
  const body = { model: cfg.model || 'gpt-4o-mini', messages, temperature: 0.2 };
  const res = await fetch(cfg.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.api_key}` },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`LLM HTTP ${res.status}: ${t}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content?.trim?.();
  let parsed;
  try { parsed = JSON.parse(content); }
  catch (e) {
    const m = content && content.match(/\{[\s\S]*\}/);
    if (m) parsed = JSON.parse(m[0]);
  }
  if (!parsed || typeof parsed.text !== 'string') {
    throw new Error('LLM response parse error (explain)');
  }
  return { text: parsed.text, anchor: parsed.anchor || '' };
}

function getLLMCfg() {
  // 优先使用自定义；否则 profile.json 中的 llm
  const ov = llmOverride || {};
  const pf = userProfile?.llm || {};
  return {
    endpoint: ov.endpoint || pf.endpoint || '',
    api_key: ov.api_key || pf.api_key || '',
    model: ov.model || pf.model || 'gpt-4o-mini'
  };
}

function hasLLM() {
  const cfg = getLLMCfg();
  return !!(cfg.endpoint && cfg.api_key);
}

function shouldExplain(text) {
  const s = String(text).trim();
  if (s.length < 2 || s.length > 120) return false;
  const words = s.split(/\s+/);
  if (words.length > 8) return false;
  if (!/[A-Za-z\u4e00-\u9fa5]/.test(s)) return false;
  return true;
}

function isFeatureSelection(text) {
  const s = String(text).toLowerCase();
  const tokens = [
    // connectivity/codecs
    'bluetooth','bt','aac','aptx','ldac','wifi','airplay','chromecast','hdmi','earc','arc','usb-c','aux',
    // audio
    'anc','noise cancelling','noise-canceling','woofer','tweeter','driver','watt','rms','db','ohm','khz','hz','snr','thd','dolby','dts','atmos','latency','ms',
    // durability & rating
    'ipx','ip67','ip68','waterproof','dustproof','splash',
    // battery
    'mah','battery','playtime','hours','h',
    // general feature words
    'feature','spec','selling point','优势','卖点','特色','特性','降噪','续航','低延迟','编码','防水','防尘',
    // nutrition/supplement
    'protein','whey','casein','isolate','concentrate','bcaa','leucine','creatine','serving','scoop','kcal','calorie','calories','g ',' g/','grams','sugar','sweetener','lactose','digest','absorption','hydrolyzed',
    '蛋白','乳清','酪蛋白','分离','浓缩','支链','亮氨酸','肌酸','每勺','每份','热量','卡路里','克','糖','甜味剂','低乳糖','易消化','配方','配料','无麸质','增肌','恢复','吸收'
  ];
  return tokens.some(t => s.includes(t));
}

// -------------------- 尺码解析与解释 --------------------
function parseSizeContext(text) {
  const s = String(text).replace(/\u00A0/g, ' ').trim();
  const low = s.toLowerCase();
  // Direct size labels
  if (/\b(xxxs|xxs|xs|s|m|l|xl|xxl|xxxl)\b/i.test(s)) {
    return { kind: 'size_label', label: s.match(/\b(XXXS|XXS|XS|S|M|L|XL|XXL|XXXL)\b/i)[0].toUpperCase() };
  }
  // Shoe sizes
  const shoe = low.match(/\b(US|UK|EU)\s*([0-9]{1,2}(?:\.5)?)\b/i) || low.match(/([3-4][0-9])\s*码/);
  if (shoe) {
    const sys = (shoe[1] || 'CN').toUpperCase();
    const val = parseFloat(shoe[2] || shoe[1]);
    return { kind: 'shoe', system: sys, value: isFinite(val) ? val : null };
  }
  // Waist / inseam / generic length with units
  const mInseam = low.match(/\b(inseam|inside\s*leg|内长|裤长)\D{0,8}([0-9]{2,3}(?:\.[0-9])?)\s*(cm|毫米|mm|in|inch|")/i);
  if (mInseam) return { kind: 'inseam', value: parseFloat(mInseam[2]), unit: normUnit(mInseam[3]) };
  const mWaist = low.match(/\b(waist|腰围)\D{0,8}([0-9]{2,3}(?:\.[0-9])?)\s*(cm|毫米|mm|in|inch|")/i);
  if (mWaist) return { kind: 'waist', value: parseFloat(mWaist[2]), unit: normUnit(mWaist[3]) };
  // Generic: number + unit and a sizing token nearby
  const mLen = low.match(/([0-9]{2,3}(?:\.[0-9])?)\s*(cm|毫米|mm|in|inch|")/i);
  if (mLen && /(length|衣长|袖长|胸围|肩宽|hip|bust|chest|shoulder|sleeve)/i.test(low)) {
    return { kind: 'length', value: parseFloat(mLen[1]), unit: normUnit(mLen[2]) };
  }
  return null;
}

function normUnit(u){
  if (!u) return null;
  const t = String(u).toLowerCase();
  if (t === 'mm' || t === '毫米') return 'mm';
  if (t === 'cm') return 'cm';
  if (t === 'in' || t === 'inch' || t === '"') return 'in';
  return t;
}

function generateSizeHeuristic(ctx) {
  const lang = explainLang || 'zh';
  const fit = userPhysical?.preferred_fit || 'regular';
  const height = userPhysical?.height_cm;
  const toCm = (val, unit) => unit === 'cm' ? val : unit === 'in' ? val * 2.54 : unit === 'mm' ? val / 10 : val;
  let text = '', anchor = '';
  if (ctx.kind === 'pack' && ctx.dims) {
    return generatePackHeuristic(ctx);
  }
  if ((ctx.kind === 'inseam' || ctx.kind === 'length') && ctx.value) {
    const cm = toCm(ctx.value, ctx.unit);
    const inches = cm / 2.54;
    // rough mapping: height ≈ inseam * 2.3 (regular fit)
    const k = fit === 'slim' ? 2.25 : fit === 'relaxed' ? 2.35 : 2.3;
    const est = Math.round(cm * k);
    const labelZh = ctx.kind === 'inseam' ? '裤长' : '长度';
    const labelEn = ctx.kind === 'inseam' ? 'Inseam' : 'Length';
    text = lang.startsWith('zh') ? `${labelZh}约 ${cm.toFixed(0)} cm（≈ ${inches.toFixed(1)} in）` : `${labelEn} ~ ${cm.toFixed(0)} cm (≈ ${inches.toFixed(1)} in)`;
    if (ctx.kind === 'inseam') {
      if (height && isFinite(height)) {
        const diff = height - est;
        const hint = diff > 3 ? (lang.startsWith('zh') ? '偏短' : 'short') : diff < -3 ? (lang.startsWith('zh') ? '偏长' : 'long') : (lang.startsWith('zh') ? '大致合适' : 'about right');
        anchor = lang.startsWith('zh') ? `按${fit}版型估算，身高约 ${est} cm 合适；你是 ${height} cm，${hint}` : `For ${fit} fit, est height ~${est} cm; you are ${height} cm, ${hint}`;
      } else {
        anchor = lang.startsWith('zh') ? `按${fit}版型估算，适合身高约 ${Math.round(est-3)}–${Math.round(est+3)} cm` : `For ${fit} fit, fits height ~${Math.round(est-3)}–${Math.round(est+3)} cm`;
      }
    } else {
      anchor = lang.startsWith('zh') ? '不同品牌/版型差异较大，建议结合尺码表' : 'Brand and fit vary; check size chart';
    }
    return { text, anchor };
  }
  if (ctx.kind === 'waist' && ctx.value) {
    const cm = toCm(ctx.value, ctx.unit);
    const inches = cm / 2.54;
    text = lang.startsWith('zh') ? `腰围约 ${cm.toFixed(0)} cm（≈ ${inches.toFixed(1)} in）` : `Waist ~ ${cm.toFixed(0)} cm (≈ ${inches.toFixed(1)} in)`;
    anchor = lang.startsWith('zh') ? '不同品牌/版型差异较大，建议结合尺码表' : 'Brand and fit vary; check size chart';
    return { text, anchor };
  }
  if (ctx.kind === 'shoe') {
    // Heuristic shoe conversion via foot length
    const userFoot = userPhysical?.foot_length_cm;
    const from = ctx.system || 'EU';
    const foot = footFromShoe(ctx) || userFoot || null;
    if (foot) {
      const conv = shoeFromFoot(foot);
      const base = `${lang.startsWith('zh') ? '参考脚长' : 'Ref foot length'} ${foot.toFixed(1)} cm`;
      const lineEU = `EU ${Math.round(conv.EU)}`;
      const lineUSm = `US ${formatHalf(conv.USm)}`;
      const lineUK = `UK ${formatHalf(conv.UK)}`;
      text = lang.startsWith('zh') ? `鞋码建议：${lineEU} • ${lineUSm} • ${lineUK}` : `Shoe suggestion: ${lineEU} • ${lineUSm} • ${lineUK}`;
      if (userFoot && isFinite(userFoot)) {
        const userConv = shoeFromFoot(userFoot);
        const userEU = Math.round(userConv.EU);
        anchor = lang.startsWith('zh') ? `你的脚长约 ${userFoot.toFixed(1)} cm，EU 推荐约 ${userEU}（品牌/楦头差异较大，建议试穿）` : `Your foot ~${userFoot.toFixed(1)} cm, EU ~${userEU} (brand/last varies; try on if possible)`;
      } else {
        anchor = lang.startsWith('zh') ? `${base}（品牌/楦头差异较大，建议试穿）` : `${base} (brand/last varies; try on)`;
      }
      return { text, anchor };
    } else {
      text = lang.startsWith('zh') ? '鞋码信息' : 'Shoe size';
      anchor = lang.startsWith('zh') ? '建议提供脚长（cm）以便更准确转换' : 'Provide foot length (cm) for better conversion';
      return { text, anchor };
    }
  }
  if (ctx.kind === 'size_label') {
    text = lang.startsWith('zh') ? `尺寸标签：${ctx.label}` : `Size label: ${ctx.label}`;
    anchor = lang.startsWith('zh') ? '不同品牌的 S/M/L 尺码范围不同，建议参考胸围/肩宽' : 'Label ranges vary by brand; check chest/shoulder measurements';
    return { text, anchor };
  }
  // fallback
  return { text: lang.startsWith('zh') ? '尺码信息' : 'Sizing info', anchor: lang.startsWith('zh') ? '建议查看品牌尺码表' : 'Check brand size chart' };
}

function generatePackHeuristic(ctx) {
  const lang = explainLang || 'zh';
  const toCm = (v,u) => u === 'cm' ? v : u === 'in' ? v*2.54 : u === 'mm' ? v/10 : v;
  const vals = ctx.dims.values.map(p => toCm(p.v, p.unit || ctx.dims.unit));
  let liters = 0;
  if (vals.length === 2 || (vals.length>=2 && ctx.dims.hasDia)) {
    const d = vals[0]; const h = vals[1];
    liters = Math.PI * Math.pow(d/2,2) * h / 1000;
  } else if (vals.length >= 3) {
    liters = (vals[0]*vals[1]*vals[2]) / 1000;
  }
  if (liters <= 0) {
    return { text: lang.startsWith('zh') ? '收纳体积' : 'Packed volume', anchor: '' };
  }
  const bottles = liters / 0.5;
  const text = lang.startsWith('zh')
    ? `收纳体积约 ${liters.toFixed(liters<3?2:1)} L（≈ ${bottles.toFixed(bottles<10?1:0)} 瓶500ml）`
    : `Packed volume ~ ${liters.toFixed(liters<3?2:1)} L (≈ ${bottles.toFixed(bottles<10?1:0)} × 500ml bottles)`;
  // Dynamic context-based anchor: pocket / backpack / carry-on
  let anchor;
  if (liters <= 0.8) {
    anchor = lang.startsWith('zh') ? '可放入大衣口袋/收纳袋；背包顶袋轻松放入' : 'Fits coat pocket or stuff sack; easy in top pocket';
  } else if (liters <= 1.5) {
    anchor = lang.startsWith('zh') ? '≈ 一个 1L 水瓶体积；背包侧袋适配' : '≈ a 1L bottle; fits backpack side pocket';
  } else if (liters <= 3) {
    const pct20 = Math.round((liters/20)*100);
    anchor = lang.startsWith('zh') ? `约占 20L 日包 ${pct20}% 空间（主仓/顶袋）` : `~${pct20}% of a 20L daypack (main/top)`;
  } else if (liters <= 8) {
    const pct20 = Math.round((liters/20)*100);
    anchor = lang.startsWith('zh') ? `建议放入 20L 日包主仓，约占 ${pct20}% 空间` : `Put in 20L daypack main compartment (~${pct20}%)`;
  } else {
    const pct30 = Math.round((liters/30)*100);
    anchor = lang.startsWith('zh') ? `约占 30L 随身箱 ${pct30}% 空间` : `~${pct30}% of a 30L carry-on`;
  }
  return { text, anchor };
}

async function generateSizeExplanationWithLLM(selectedText, sizeCtx) {
  const cfg = getLLMCfg();
  if (!cfg.endpoint || !cfg.api_key) {
    throw new Error('LLM config missing.');
  }
  const lang = explainLang || 'zh';
  const payload = {
    text: selectedText,
    parsed: sizeCtx,
    user_physical: userPhysical || {},
    desired_language: lang
  };
  const sys = [
    'You explain product sizing in shopping contexts.',
    'Use provided parsed info and user physical to give actionable advice.',
    'Be concise (1-2 sentences).',
    'Return strictly JSON: {"text": string, "anchor": string}.',
    'text: primary advice in desired language; anchor: a short tip (e.g., fit, hem, brand variance).'
  ].join(' ');
  const messages = [
    { role: 'system', content: sys },
    { role: 'user', content: JSON.stringify(payload) }
  ];
  const body = { model: cfg.model || 'gpt-4o-mini', messages, temperature: 0.2 };
  const res = await fetch(cfg.endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.api_key}` }, body: JSON.stringify(body)
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`LLM HTTP ${res.status}: ${t}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content?.trim?.();
  let parsed;
  try { parsed = JSON.parse(content); }
  catch (e) { const m = content && content.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); }
  if (!parsed || typeof parsed.text !== 'string') throw new Error('LLM response parse error (size)');
  return { text: parsed.text, anchor: parsed.anchor || '' };
}

// -------------------- 统一认知理解（价格/尺码/术语）LLM --------------------
async function generateCognitiveWithLLM({ selectedText, task, price, sizeCtx, lang }) {
  const cfg = getLLMCfg();
  if (!cfg.endpoint || !cfg.api_key) throw new Error('LLM config missing.');
  const targetCurrency = (overrideTargetCurrency || userProfile?.user_context?.currency || 'CNY').toUpperCase();
  const payload = {
    selectedText,
    task: task || (price ? 'price' : (sizeCtx ? 'size' : 'term')),
    lang: lang || 'zh',
    price,
    size: sizeCtx,
    user_context: userProfile?.user_context || {},
    user_physical: userPhysical || {},
    anchors: {
      profile: userProfile?.cognitive_anchors || {},
      custom: customAnchorUnit || null
    },
    target_currency: targetCurrency,
    page_context: pageContext || {},
    page_intent: pageIntent || classifyPageIntentHeuristic()
  };
  const sys = [
    'You are Babel Tower, a cognitive translator/explainer.',
    'Return strictly JSON: {"text": string, "anchor": string}.',
    'Always adopt the end-user perspective indicated by page_intent (category, user_goal). Assume the user is evaluating this product for their own use.',
    'For task=price: convert to target_currency and include a cognitive anchor (e.g., cups of coffee, subscription months), using provided anchors/custom unit when available.',
    'For task=size: if garment sizing, give practical advice (fit, hemming, brand variance).',
    'If packed/packing size of gear/clothing, translate into intuitive volume (liters) and luggage footprint (e.g., percent of 30L suitcase), and compare to common objects (e.g., 500ml bottles).',
    'For task=feature: explain what the feature/spec means in practice and why it matters to a buyer; add one caveat or dependency if relevant. Be concise (1–2 sentences).',
    'For task=term: explain in 1-2 sentences, practical and clear.',
  ].join(' ');
  const messages = [
    { role: 'system', content: sys },
    { role: 'user', content: JSON.stringify(payload) }
  ];
  const body = { model: cfg.model || 'gpt-4o-mini', messages, temperature: 0.2 };
  const res = await fetch(cfg.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.api_key}` }, body: JSON.stringify(body) });
  if (!res.ok) { const t = await res.text().catch(()=>''); throw new Error(`LLM HTTP ${res.status}: ${t}`); }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content?.trim?.();
  let parsed; try { parsed = JSON.parse(content); } catch (e) { const m = content && content.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); }
  if (!parsed || typeof parsed.text !== 'string') throw new Error('LLM response parse error (cognitive)');
  return { text: parsed.text, anchor: parsed.anchor || '', translation: parsed.translation || '' };
}

async function generateTranslationWithLLM(selectedText, lang) {
  const cfg = getLLMCfg();
  if (!cfg.endpoint || !cfg.api_key) throw new Error('LLM config missing.');
  const sys = 'Translate the user text to the desired language. Return strictly JSON: {"translation": string}.';
  const hint = lang === 'en' ? 'English' : (lang === 'zh-en' ? 'Chinese and English bilingual' : 'Chinese');
  const messages = [
    { role: 'system', content: `${sys} Language: ${hint}` },
    { role: 'user', content: selectedText }
  ];
  const body = { model: cfg.model || 'gpt-4o-mini', messages, temperature: 0 };
  const res = await fetch(cfg.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.api_key}` }, body: JSON.stringify(body) });
  if (!res.ok) { const t = await res.text().catch(()=> ''); throw new Error(`LLM HTTP ${res.status}: ${t}`); }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content?.trim?.();
  let parsed; try { parsed = JSON.parse(content); } catch (e) { const m = content && content.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); }
  return parsed && parsed.translation ? String(parsed.translation) : '';
}

// ---- Shoe conversion helpers (heuristic) ----
function footFromShoe(ctx) {
  // Return approximate foot length in cm from a shoe size/context
  try {
    if (!ctx) return null;
    if (ctx.system === 'EU' || ctx.system === 'CN') {
      const eu = ctx.value;
      if (!isFinite(eu)) return null;
      // inverse of EU ≈ (foot_cm + 1.5) * 1.5
      return (eu / 1.5) - 1.5;
    }
    if (ctx.system === 'US') {
      const us = ctx.value;
      if (!isFinite(us)) return null;
      // US Men ≈ 3*in - 22 => in ≈ (US + 22)/3
      const inches = (us + 22) / 3;
      return inches * 2.54;
    }
    if (ctx.system === 'UK') {
      const uk = ctx.value;
      if (!isFinite(uk)) return null;
      // UK ≈ US - 0.5 => US ≈ UK + 0.5
      const inches = (uk + 0.5 + 22) / 3;
      return inches * 2.54;
    }
  } catch {}
  return null;
}

function shoeFromFoot(foot_cm) {
  const inches = foot_cm / 2.54;
  // US Men ≈ 3*in - 22; Women ≈ USm + 1.5; UK ≈ USm - 0.5; EU ≈ (cm + 1.5)*1.5
  const USm = (3 * inches) - 22;
  const USw = USm + 1.5;
  const UK = USm - 0.5;
  const EU = (foot_cm + 1.5) * 1.5;
  return { USm, USw, UK, EU };
}

function formatHalf(x) {
  // round to nearest 0.5
  const r = Math.round(x * 2) / 2;
  return (Math.abs(r - Math.round(r)) < 1e-6) ? String(Math.round(r)) : r.toFixed(1);
}

// -------------------- Overlay 渲染 --------------------
function showOverlay(x, y, content) {
  removeOverlay();

  const overlay = document.createElement('div');
  overlay.id = 'babel-tower-root';
  overlay.style.left = `${x}px`;
  overlay.style.top = `${y + 20}px`;

  overlay.innerHTML = template(content);
  document.body.appendChild(overlay);
  currentOverlay = overlay;

  document.addEventListener('mousedown', handleClickOutside);
  instrumentOverlay();
}

function updateOverlay(content) {
  if (!currentOverlay) return;
  currentOverlay.innerHTML = template(content);
  instrumentOverlay();
}

  function template(content) {
    return `
      <div class="bt-card">
        <div class="bt-drag" title="拖动移动卡片"></div>
        <div class="bt-insight">${escapeHTML(content.insight || '')}</div>
        <div class="bt-anchor">${escapeHTML(content.anchor || '')}</div>
        <div class="bt-meta">Babel Tower • Context Layer</div>
        ${showTranslation && content.translation ? `<div class="bt-translation">${escapeHTML(content.translation)}</div>` : ''}
        <div class="bt-actions"><button class="bt-gear" title="Open Settings">⚙︎</button></div>
      </div>
    `;
  }

function removeOverlay() {
  if (currentOverlay) {
    currentOverlay.remove();
    currentOverlay = null;
    document.removeEventListener('mousedown', handleClickOutside);
  }
}

function isPackDimsNotHelpful() {
  try {
    const title = (pageContext?.title || document.title || '').toLowerCase();
    const host = (pageContext?.host || location.host || '').toLowerCase();
    const schema = (pageContext?.schema || '').toLowerCase();
    // categories where pack dims are not helpful: clothing, audio, supplement, electronics
    const text = `${title} ${schema}`;
    if (/(jacket|down|parka|coat|shirt|tee|t-shirt|sweater|hoodie|pant|jean|trouser|skirt|dress|羽绒|外套|上衣|裤|裙)/.test(text)) return true;
    if (/(speaker|soundbar|bluetooth|anc|audio|headphone|音箱|耳机|降噪)/.test(text)) return true;
    if (/(protein|whey|supplement|bcaa|creatine|蛋白|补剂|增肌)/.test(text)) return true;
    if (/(laptop|monitor|phone|camera|electronics|电子|显示器|相机|手机)/.test(text)) return true;
  } catch {}
  return false;
}

function handleClickOutside(event) {
  if (currentOverlay && !currentOverlay.contains(event.target)) {
    removeOverlay();
  }
}

function escapeHTML(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function instrumentOverlay() {
  try {
    const btn = currentOverlay && currentOverlay.querySelector('.bt-gear');
    if (btn && !btn.__bt_bound) {
      btn.__bt_bound = true;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          chrome.runtime.sendMessage({ type: 'bt_open_options' }, () => {});
        } catch (err) {
          try {
            window.open(chrome.runtime.getURL('options.html'), '_blank');
          } catch {}
        }
      });
    }

    // Drag handle for moving overlay
    const handle = currentOverlay && currentOverlay.querySelector('.bt-drag');
    if (handle && !handle.__bt_bound) {
      handle.__bt_bound = true;
      let dragging = false;
      let offX = 0, offY = 0;
      const onMouseMove = (ev) => {
        if (!dragging || !currentOverlay) return;
        const x = Math.max(0, Math.min(window.scrollX + window.innerWidth - 40, ev.clientX - offX));
        const y = Math.max(0, Math.min(window.scrollY + window.innerHeight - 40, ev.clientY - offY));
        currentOverlay.style.left = `${x}px`;
        currentOverlay.style.top = `${y}px`;
      };
      const onMouseUp = () => {
        dragging = false;
        document.removeEventListener('mousemove', onMouseMove, true);
        document.removeEventListener('mouseup', onMouseUp, true);
      };
      handle.addEventListener('mousedown', (ev) => {
        if (!currentOverlay) return;
        ev.preventDefault();
        ev.stopPropagation();
        const rect = currentOverlay.getBoundingClientRect();
        offX = ev.clientX - rect.left;
        offY = ev.clientY - rect.top;
        dragging = true;
        document.addEventListener('mousemove', onMouseMove, true);
        document.addEventListener('mouseup', onMouseUp, true);
      });
    }
  } catch {}
}
