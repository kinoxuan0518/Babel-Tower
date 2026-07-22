/**
 * Babel Tower - Size Parser
 * Parses sizing information (clothing, shoes, packing dimensions)
 */

// Precompiled regex patterns
const SIZE_LABEL_RE = /\b(XXXS|XXS|XS|S|M|L|XL|XXL|XXXL)\b/i;
const SHOE_SYSTEM_RE = /\b(US|UK|EU)\s*([0-9]{1,2}(?:\.5)?)\b/i;
const SHOE_CN_RE = /([3-4][0-9])\s*码/;
const INSEAM_RE = /\b(inseam|inside\s*leg|内长|裤长)\D{0,8}([0-9]{2,3}(?:\.[0-9])?)\s*(cm|毫米|mm|in|inch|")/i;
const WAIST_RE = /\b(waist|腰围)\D{0,8}([0-9]{2,3}(?:\.[0-9])?)\s*(cm|毫米|mm|in|inch|")/i;
const LENGTH_RE = /([0-9]{2,3}(?:\.[0-9])?)\s*(cm|毫米|mm|in|inch|")/i;
const SIZE_CONTEXT_RE = /(length|衣长|袖长|胸围|肩宽|hip|bust|chest|shoulder|sleeve)/i;

// Pack dimensions patterns
const PACK_DIMS_RE = /([0-9]{1,4}(?:\.[0-9])?)\s*(cm|mm|in|inch|"|×|x)\s*[×x]\s*([0-9]{1,4}(?:\.[0-9])?)\s*(cm|mm|in|inch|")?\s*(?:[×x]\s*([0-9]{1,4}(?:\.[0-9])?)\s*(cm|mm|in|inch|")?)?/i;
const CYLINDER_RE = /(?:dia(?:meter)?|直径)\s*[:\s]*([0-9]{1,3}(?:\.[0-9])?)\s*(cm|mm|in)?.*?(?:height|高度?)\s*[:\s]*([0-9]{1,3}(?:\.[0-9])?)\s*(cm|mm|in)?/i;

/**
 * Normalize unit string to standard form
 * @param {string} u Unit string
 * @returns {string|null} Normalized unit
 */
function normalizeUnit(u) {
  if (!u) return null;
  const t = String(u).toLowerCase();
  if (t === 'mm' || t === '毫米') return 'mm';
  if (t === 'cm') return 'cm';
  if (t === 'in' || t === 'inch' || t === '"') return 'in';
  return t;
}

/**
 * Parse size context from text
 * @param {string} text Input text
 * @returns {Object|null} Parsed size context
 */
export function parseSizeContext(text) {
  const s = String(text).replace(/\u00A0/g, ' ').trim();
  const low = s.toLowerCase();
  
  // Size labels (S, M, L, XL, etc.)
  const labelMatch = s.match(SIZE_LABEL_RE);
  if (labelMatch) {
    return { kind: 'size_label', label: labelMatch[0].toUpperCase() };
  }
  
  // Shoe sizes
  const shoeMatch = low.match(SHOE_SYSTEM_RE) || low.match(SHOE_CN_RE);
  if (shoeMatch) {
    const system = (shoeMatch[1] || 'CN').toUpperCase();
    const value = parseFloat(shoeMatch[2] || shoeMatch[1]);
    return { kind: 'shoe', system, value: isFinite(value) ? value : null };
  }
  
  // Inseam measurement
  const inseamMatch = low.match(INSEAM_RE);
  if (inseamMatch) {
    return {
      kind: 'inseam',
      value: parseFloat(inseamMatch[2]),
      unit: normalizeUnit(inseamMatch[3])
    };
  }
  
  // Waist measurement
  const waistMatch = low.match(WAIST_RE);
  if (waistMatch) {
    return {
      kind: 'waist',
      value: parseFloat(waistMatch[2]),
      unit: normalizeUnit(waistMatch[3])
    };
  }
  
  // Pack dimensions (3D or 2D with diameter)
  const packMatch = low.match(PACK_DIMS_RE);
  if (packMatch) {
    const dims = {
      values: [
        { v: parseFloat(packMatch[1]), unit: normalizeUnit(packMatch[2]) || 'cm' }
      ],
      unit: normalizeUnit(packMatch[2]) || 'cm',
      hasDia: false
    };
    if (packMatch[3]) {
      dims.values.push({ v: parseFloat(packMatch[3]), unit: normalizeUnit(packMatch[4]) || dims.unit });
    }
    if (packMatch[5]) {
      dims.values.push({ v: parseFloat(packMatch[5]), unit: normalizeUnit(packMatch[6]) || dims.unit });
    }
    return { kind: 'pack', dims };
  }
  
  // Cylinder dimensions (diameter × height)
  const cylMatch = low.match(CYLINDER_RE);
  if (cylMatch) {
    return {
      kind: 'pack',
      dims: {
        values: [
          { v: parseFloat(cylMatch[1]), unit: normalizeUnit(cylMatch[2]) || 'cm' },
          { v: parseFloat(cylMatch[3]), unit: normalizeUnit(cylMatch[4]) || 'cm' }
        ],
        unit: 'cm',
        hasDia: true
      }
    };
  }
  
  // Generic length with sizing context
  const lenMatch = low.match(LENGTH_RE);
  if (lenMatch && SIZE_CONTEXT_RE.test(low)) {
    return {
      kind: 'length',
      value: parseFloat(lenMatch[1]),
      unit: normalizeUnit(lenMatch[2])
    };
  }
  
  return null;
}

/**
 * Check if selection appears to be about product features
 * @param {string} text Input text
 * @returns {boolean}
 */
export function isFeatureSelection(text) {
  const s = String(text).toLowerCase();
  
  const featureTokens = [
    // Connectivity/codecs
    'bluetooth', 'bt', 'aac', 'aptx', 'ldac', 'wifi', 'airplay', 'chromecast', 'hdmi', 'earc', 'arc', 'usb-c', 'aux',
    // Audio
    'anc', 'noise cancelling', 'noise-canceling', 'woofer', 'tweeter', 'driver', 'watt', 'rms', 'db', 'ohm', 'khz', 'hz',
    'snr', 'thd', 'dolby', 'dts', 'atmos', 'latency', 'ms',
    // Durability/rating
    'ipx', 'ip67', 'ip68', 'waterproof', 'dustproof', 'splash',
    // Battery
    'mah', 'battery', 'playtime', 'hours',
    // General feature words
    'feature', 'spec', 'selling point', '优势', '卖点', '特色', '特性', '降噪', '续航', '低延迟', '编码', '防水', '防尘',
    // Nutrition/supplement
    'protein', 'whey', 'casein', 'isolate', 'concentrate', 'bcaa', 'leucine', 'creatine', 'serving', 'scoop', 'kcal',
    'calorie', 'calories', 'grams', 'sugar', 'sweetener', 'lactose', 'digest', 'absorption', 'hydrolyzed',
    '蛋白', '乳清', '酪蛋白', '分离', '浓缩', '支链', '亮氨酸', '肌酸', '每勺', '每份', '热量', '卡路里', '克', '糖',
    '甜味剂', '低乳糖', '易消化', '配方', '配料', '无麸质', '增肌', '恢复', '吸收'
  ];
  
  return featureTokens.some(t => s.includes(t));
}

/**
 * Check if text should trigger term explanation
 * @param {string} text Input text
 * @returns {boolean}
 */
export function shouldExplain(text) {
  const s = String(text).trim();
  if (s.length < 2 || s.length > 120) return false;
  
  const words = s.split(/\s+/);
  if (words.length > 8) return false;
  
  // Must contain letters (Latin or Chinese)
  if (!/[A-Za-z\u4e00-\u9fa5]/.test(s)) return false;
  
  return true;
}
