/**
 * Babel Tower - Page Context / Intent Detection
 */

// Precompiled patterns for page classification
const CATEGORY_PATTERNS = {
  supplement: /(protein|whey|casein|supplement|bcaa|creatine|蛋白|乳清|酪蛋白|增肌|补剂)/i,
  audio: /(speaker|soundbar|bluetooth|anc|audio|headphone|音箱|耳机|降噪)/i,
  clothing: /(jacket|coat|shirt|pant|jean|skirt|dress|hoodie|down|outer|羽绒|外套|衣|上衣|裤|裙)/i,
  furniture: /(desk|table|chair|sofa|furniture|家具|书桌|桌|椅)/i,
  electronics: /(laptop|monitor|phone|camera|electronics|电子|显示器|相机|手机)/i
};

const GARMENT_PATTERN = /(jacket|down|parka|coat|shirt|tee|t-shirt|sweater|hoodie|pant|jean|trouser|skirt|dress|羽绒|外套|上衣|裤|裙)/i;
const AUDIO_PATTERN = /(speaker|soundbar|bluetooth|anc|audio|headphone|音箱|耳机|降噪)/i;
const SUPPLEMENT_PATTERN = /(protein|whey|supplement|bcaa|creatine|蛋白|补剂|增肌)/i;
const ELECTRONICS_PATTERN = /(laptop|monitor|phone|camera|electronics|电子|显示器|相机|手机)/i;

/**
 * Gather page context from DOM
 * @returns {Object} Page context
 */
export function gatherPageContext() {
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
    
    // Schema.org detection
    let schema = '';
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const s of scripts) {
      try {
        const json = JSON.parse(s.textContent || '{}');
        const t = Array.isArray(json) ? json.map(x => x['@type']).join(',') : (json['@type'] || '');
        if (t && /Product|Offer/i.test(t)) {
          schema = t;
          break;
        }
      } catch { }
    }
    
    return { lang, title, host, ogType, siteName, canonical, schema };
  } catch {
    return { lang: '', title: '', host: '', ogType: '', siteName: '', canonical: '', schema: '' };
  }
}

/**
 * Classify page intent using heuristics
 * @param {Object} pageContext Page context
 * @returns {{ category: string, user_goal: string }}
 */
export function classifyPageIntentHeuristic(pageContext = null) {
  try {
    const ctx = pageContext || gatherPageContext();
    const t = (ctx.title || document.title || '').toLowerCase();
    const schema = (ctx.schema || '').toLowerCase();
    
    let category = 'other';
    
    for (const [cat, pattern] of Object.entries(CATEGORY_PATTERNS)) {
      if (pattern.test(t)) {
        category = cat;
        break;
      }
    }
    
    const user_goal = /product|offer/.test(schema) ? 'buying' : 'reading';
    
    return { category, user_goal };
  } catch {
    return { category: 'other', user_goal: 'reading' };
  }
}

/**
 * Generate cache key for page intent
 * @returns {string}
 */
export function getIntentCacheKey() {
  try {
    const host = location.host || '';
    const path = (location.pathname || '').split('/').slice(0, 2).join('/');
    return `${host}${path}`;
  } catch {
    return String(Date.now());
  }
}

/**
 * Check if pack dimensions are not helpful for this page type
 * (e.g., clothing pages don't need packing dimensions)
 * @param {Object} pageContext Page context
 * @returns {boolean}
 */
export function isPackDimsNotHelpful(pageContext = null) {
  try {
    const ctx = pageContext || gatherPageContext();
    const text = `${ctx.title || ''} ${ctx.schema || ''}`.toLowerCase();
    
    if (GARMENT_PATTERN.test(text)) return true;
    if (AUDIO_PATTERN.test(text)) return true;
    if (SUPPLEMENT_PATTERN.test(text)) return true;
    if (ELECTRONICS_PATTERN.test(text)) return true;
    
    return false;
  } catch {
    return false;
  }
}

/**
 * Check if current context is garment-related
 * @param {Object} pageContext Page context
 * @returns {boolean}
 */
export function isGarmentContext(pageContext = null) {
  try {
    const ctx = pageContext || gatherPageContext();
    const text = `${ctx.title || ''} ${ctx.schema || ''}`.toLowerCase();
    return GARMENT_PATTERN.test(text);
  } catch {
    return false;
  }
}
