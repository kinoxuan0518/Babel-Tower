/**
 * Babel Tower - Size Heuristics
 * Generates cognitive insights for sizing without LLM
 */

import { formatHalf } from '../../shared/utils.js';

/**
 * Convert measurement to centimeters
 * @param {number} value Measurement value
 * @param {string} unit Unit string
 * @returns {number} Value in cm
 */
function toCm(value, unit) {
  if (unit === 'cm') return value;
  if (unit === 'in') return value * 2.54;
  if (unit === 'mm') return value / 10;
  return value;
}

/**
 * Calculate foot length from shoe context
 * @param {Object} ctx Shoe size context
 * @returns {number|null} Foot length in cm
 */
export function footFromShoe(ctx) {
  if (!ctx) return null;
  
  const { system, value } = ctx;
  if (!Number.isFinite(value)) return null;
  
  if (system === 'EU' || system === 'CN') {
    // EU ≈ (foot_cm + 1.5) * 1.5
    return (value / 1.5) - 1.5;
  }
  
  if (system === 'US') {
    // US Men ≈ 3*in - 22
    const inches = (value + 22) / 3;
    return inches * 2.54;
  }
  
  if (system === 'UK') {
    // UK ≈ US - 0.5
    const inches = (value + 0.5 + 22) / 3;
    return inches * 2.54;
  }
  
  return null;
}

/**
 * Calculate shoe sizes from foot length
 * @param {number} footCm Foot length in cm
 * @returns {{ USm: number, USw: number, UK: number, EU: number }}
 */
export function shoeFromFoot(footCm) {
  const inches = footCm / 2.54;
  return {
    USm: (3 * inches) - 22,
    USw: (3 * inches) - 22 + 1.5,
    UK: (3 * inches) - 22 - 0.5,
    EU: (footCm + 1.5) * 1.5
  };
}

/**
 * Generate heuristic for clothing/body size
 * @param {Object} ctx Size context
 * @param {Object} config Configuration
 * @returns {{ text: string, anchor: string }}
 */
export function generateSizeHeuristic(ctx, config = {}) {
  const { lang = 'zh', userPhysical = {} } = config;
  const fit = userPhysical?.preferred_fit || 'regular';
  const height = userPhysical?.height_cm;
  const isZh = lang.startsWith('zh');
  
  let text = '', anchor = '';
  
  // Pack dimensions (handled separately)
  if (ctx.kind === 'pack' && ctx.dims) {
    return generatePackHeuristic(ctx, config);
  }
  
  // Inseam / Length
  if ((ctx.kind === 'inseam' || ctx.kind === 'length') && ctx.value) {
    const cm = toCm(ctx.value, ctx.unit);
    const inches = cm / 2.54;
    
    // Height estimation: height ≈ inseam * k
    const k = fit === 'slim' ? 2.25 : fit === 'relaxed' ? 2.35 : 2.3;
    const est = Math.round(cm * k);
    
    const labelZh = ctx.kind === 'inseam' ? '裤长' : '长度';
    const labelEn = ctx.kind === 'inseam' ? 'Inseam' : 'Length';
    
    text = isZh
      ? `${labelZh}约 ${cm.toFixed(0)} cm（≈ ${inches.toFixed(1)} in）`
      : `${labelEn} ~ ${cm.toFixed(0)} cm (≈ ${inches.toFixed(1)} in)`;
    
    if (ctx.kind === 'inseam') {
      if (height && Number.isFinite(height)) {
        const diff = height - est;
        const hint = diff > 3 ? (isZh ? '偏短' : 'short')
          : diff < -3 ? (isZh ? '偏长' : 'long')
          : (isZh ? '大致合适' : 'about right');
        anchor = isZh
          ? `按${fit}版型估算，身高约 ${est} cm 合适；你是 ${height} cm，${hint}`
          : `For ${fit} fit, est height ~${est} cm; you are ${height} cm, ${hint}`;
      } else {
        anchor = isZh
          ? `按${fit}版型估算，适合身高约 ${Math.round(est - 3)}–${Math.round(est + 3)} cm`
          : `For ${fit} fit, fits height ~${Math.round(est - 3)}–${Math.round(est + 3)} cm`;
      }
    } else {
      anchor = isZh ? '不同品牌/版型差异较大，建议结合尺码表' : 'Brand and fit vary; check size chart';
    }
    
    return { text, anchor };
  }
  
  // Waist
  if (ctx.kind === 'waist' && ctx.value) {
    const cm = toCm(ctx.value, ctx.unit);
    const inches = cm / 2.54;
    
    text = isZh
      ? `腰围约 ${cm.toFixed(0)} cm（≈ ${inches.toFixed(1)} in）`
      : `Waist ~ ${cm.toFixed(0)} cm (≈ ${inches.toFixed(1)} in)`;
    anchor = isZh ? '不同品牌/版型差异较大，建议结合尺码表' : 'Brand and fit vary; check size chart';
    
    return { text, anchor };
  }
  
  // Shoe size
  if (ctx.kind === 'shoe') {
    const userFoot = userPhysical?.foot_length_cm;
    const foot = footFromShoe(ctx) || userFoot || null;
    
    if (foot) {
      const conv = shoeFromFoot(foot);
      const lineEU = `EU ${Math.round(conv.EU)}`;
      const lineUSm = `US ${formatHalf(conv.USm)}`;
      const lineUK = `UK ${formatHalf(conv.UK)}`;
      
      text = isZh
        ? `鞋码建议：${lineEU} • ${lineUSm} • ${lineUK}`
        : `Shoe suggestion: ${lineEU} • ${lineUSm} • ${lineUK}`;
      
      if (userFoot && Number.isFinite(userFoot)) {
        const userConv = shoeFromFoot(userFoot);
        const userEU = Math.round(userConv.EU);
        anchor = isZh
          ? `你的脚长约 ${userFoot.toFixed(1)} cm，EU 推荐约 ${userEU}（品牌/楦头差异较大，建议试穿）`
          : `Your foot ~${userFoot.toFixed(1)} cm, EU ~${userEU} (brand/last varies; try on if possible)`;
      } else {
        anchor = isZh
          ? `参考脚长 ${foot.toFixed(1)} cm（品牌/楦头差异较大，建议试穿）`
          : `Ref foot length ${foot.toFixed(1)} cm (brand/last varies; try on)`;
      }
      
      return { text, anchor };
    } else {
      text = isZh ? '鞋码信息' : 'Shoe size';
      anchor = isZh ? '建议提供脚长（cm）以便更准确转换' : 'Provide foot length (cm) for better conversion';
      return { text, anchor };
    }
  }
  
  // Size label
  if (ctx.kind === 'size_label') {
    text = isZh ? `尺寸标签：${ctx.label}` : `Size label: ${ctx.label}`;
    anchor = isZh ? '不同品牌的 S/M/L 尺码范围不同，建议参考胸围/肩宽' : 'Label ranges vary by brand; check chest/shoulder measurements';
    return { text, anchor };
  }
  
  // Fallback
  return {
    text: isZh ? '尺码信息' : 'Sizing info',
    anchor: isZh ? '建议查看品牌尺码表' : 'Check brand size chart'
  };
}

/**
 * Generate heuristic for pack/storage dimensions
 * @param {Object} ctx Pack size context
 * @param {Object} config Configuration
 * @returns {{ text: string, anchor: string, visual?: string }}
 */
export function generatePackHeuristic(ctx, config = {}) {
  const { lang = 'zh' } = config;
  const isZh = lang.startsWith('zh');
  
  if (!ctx.dims?.values) {
    return { text: isZh ? '收纳体积' : 'Packed volume', anchor: '' };
  }
  
  const vals = ctx.dims.values.map(p => toCm(p.v, p.unit || ctx.dims.unit));
  
  let liters = 0;
  if (vals.length === 2 || (vals.length >= 2 && ctx.dims.hasDia)) {
    // Cylinder: π * r² * h
    const d = vals[0], h = vals[1];
    liters = Math.PI * Math.pow(d / 2, 2) * h / 1000;
  } else if (vals.length >= 3) {
    // Rectangular: l * w * h
    liters = (vals[0] * vals[1] * vals[2]) / 1000;
  }
  
  if (liters <= 0) {
    return { text: isZh ? '收纳体积' : 'Packed volume', anchor: '' };
  }
  
  const bottles = liters / 0.5;
  const text = isZh
    ? `收纳体积约 ${liters.toFixed(liters < 3 ? 2 : 1)} L（≈ ${bottles.toFixed(bottles < 10 ? 1 : 0)} 瓶500ml）`
    : `Packed volume ~ ${liters.toFixed(liters < 3 ? 2 : 1)} L (≈ ${bottles.toFixed(bottles < 10 ? 1 : 0)} × 500ml bottles)`;
  
  // Context-based anchor
  let anchor;
  if (liters <= 0.8) {
    anchor = isZh ? '可放入大衣口袋/收纳袋；背包顶袋轻松放入' : 'Fits coat pocket or stuff sack; easy in top pocket';
  } else if (liters <= 1.5) {
    anchor = isZh ? '≈ 一个 1L 水瓶体积；背包侧袋适配' : '≈ a 1L bottle; fits backpack side pocket';
  } else if (liters <= 3) {
    const pct20 = Math.round((liters / 20) * 100);
    anchor = isZh ? `约占 20L 日包 ${pct20}% 空间（主仓/顶袋）` : `~${pct20}% of a 20L daypack (main/top)`;
  } else if (liters <= 8) {
    const pct20 = Math.round((liters / 20) * 100);
    anchor = isZh ? `建议放入 20L 日包主仓，约占 ${pct20}% 空间` : `Put in 20L daypack main compartment (~${pct20}%)`;
  } else {
    const pct30 = Math.round((liters / 30) * 100);
    anchor = isZh ? `约占 30L 随身箱 ${pct30}% 空间` : `~${pct30}% of a 30L carry-on`;
  }
  
  // Generate visual grid
  const visual = generatePackingGrid(liters);
  
  return { text, anchor, visual };
}

/**
 * Generate visual packing grid HTML
 * @param {number} liters Volume in liters
 * @returns {string} HTML string
 */
function generatePackingGrid(liters) {
  const totalCells = 60; // 30L = 60 cells of 0.5L each
  const occupiedCells = Math.min(totalCells, Math.round(liters / 0.5));
  
  let cellsHtml = '';
  for (let i = 0; i < totalCells; i++) {
    const isOccupied = i < occupiedCells;
    cellsHtml += `<div class="bt-cell ${isOccupied ? 'bt-filled' : ''}"></div>`;
  }
  
  return `<div class="bt-pack-grid" title="占用约 ${occupiedCells * 0.5}L">${cellsHtml}</div>`;
}
