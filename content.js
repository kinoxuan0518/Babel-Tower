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
    chrome.storage.local.get(['fxToCNY','bt_targetCurrency','bt_anchor_unit'], (res) => {
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
    });
  } catch (e) {
    // ignore if storage not available yet
  }
}
loadFxFromStorageAndSettings();

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
    const useLLM = Boolean(userProfile?.llm?.endpoint && userProfile?.llm?.api_key);

    let result;
    if (useLLM) {
      result = await generateWithLLM(selectedText, price?.amount ?? null);
    } else if (price && Number.isFinite(price.amount)) {
      result = generateHeuristic(price.amount, price.currency);
    } else {
      // 没启用 LLM 且没匹配到价格——不展示
      removeOverlay();
      return;
    }

    // 若期间产生了新请求，则忽略旧请求结果
    if (requestId !== lastRequestId) return;

    // 更新 Overlay
    updateOverlay({
      original: selectedText,
      insight: result.text,
      anchor: result.anchor
    });
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

document.addEventListener('mouseup', handleSelectionEvent, true);
document.addEventListener('touchend', handleSelectionEvent, true);

// 有些站点仅 keyboard 选区，使用 selectionchange 兜底（延时读取坐标）
document.addEventListener('selectionchange', () => {
  // 轻量防抖
  clearTimeout(window.__bt_sel_t);
  window.__bt_sel_t = setTimeout(() => {
    const sel = window.getSelection();
    const text = sel ? sel.toString().trim() : '';
    if (text && text.length >= 2) {
      handleSelectionEvent({});
    }
  }, 120);
});

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
  const cfg = userProfile?.llm || {};
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
      <div class="bt-origin">原文: "${escapeHTML(content.original || '')}"</div>
      <div class="bt-insight">${escapeHTML(content.insight || '')}</div>
      <div class="bt-anchor">${escapeHTML(content.anchor || '')}</div>
      <div class="bt-meta">Babel Tower • Context Layer</div>
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
  } catch {}
}
