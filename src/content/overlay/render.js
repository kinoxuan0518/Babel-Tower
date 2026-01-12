/**
 * Babel Tower - Overlay Renderer
 * Secure DOM rendering with DOMPurify protection
 */

import DOMPurify from 'dompurify';
import { simpleMarkdown } from './markdown.js';
import { escapeHTML } from '../../shared/utils.js';
import { MSG_TYPES } from '../../shared/constants.js';

let currentOverlay = null;

/**
 * Create overlay card HTML template
 * @param {Object} content Card content
 * @param {boolean} showTranslation Whether to show translation section
 * @returns {string} HTML string
 */
function createTemplate(content, showTranslation = true) {
  // Sanitize insight content (from LLM) using DOMPurify
  const safeInsight = DOMPurify.sanitize(simpleMarkdown(content.insight || ''), {
    ALLOWED_TAGS: ['h3', 'h4', 'strong', 'em', 'li', 'br'],
    ALLOWED_ATTR: []
  });
  
  // Anchor is escaped (not parsed as markdown)
  const safeAnchor = escapeHTML(content.anchor || '');
  
  // Visual content (from heuristics, trusted)
  const safeVisual = content.visual || '';
  
  // Translation is escaped
  const safeTranslation = escapeHTML(content.translation || '');
  
  return `
    <div class="bt-card">
      <div class="bt-drag" title="Drag to move"></div>
      
      <div class="bt-scroll-area bt-insight-scroll">
        <div class="bt-insight">${safeInsight}</div>
        ${safeVisual}
        <div class="bt-anchor">${safeAnchor}</div>
      </div>

      <div class="bt-meta">Babel Tower v3</div>

      ${showTranslation && content.translation ? `
      <div class="bt-divider"></div>
      <div class="bt-scroll-area bt-translation-scroll">
        <div class="bt-translation">${safeTranslation}</div>
      </div>
      ` : ''}

      <div class="bt-actions"><button class="bt-gear" title="Open Settings">&#x2699;&#xFE0E;</button></div>
    </div>
  `;
}

/**
 * Show overlay at specified position
 * @param {number} x X coordinate
 * @param {number} y Y coordinate
 * @param {Object} content Card content
 * @param {boolean} showTranslation Whether to show translation
 */
export function showOverlay(x, y, content, showTranslation = true) {
  removeOverlay();
  
  const overlay = document.createElement('div');
  overlay.id = 'babel-tower-root';
  overlay.style.left = `${x}px`;
  overlay.style.top = `${y + 20}px`;
  
  overlay.innerHTML = createTemplate(content, showTranslation);
  document.body.appendChild(overlay);
  currentOverlay = overlay;
  
  document.addEventListener('mousedown', handleClickOutside);
  instrumentOverlay();
}

/**
 * Update existing overlay content
 * @param {Object} content New content
 * @param {boolean} showTranslation Whether to show translation
 */
export function updateOverlay(content, showTranslation = true) {
  if (!currentOverlay) return;
  currentOverlay.innerHTML = createTemplate(content, showTranslation);
  instrumentOverlay();
}

/**
 * Remove overlay from DOM
 */
export function removeOverlay() {
  if (currentOverlay) {
    currentOverlay.remove();
    currentOverlay = null;
    document.removeEventListener('mousedown', handleClickOutside);
  }
}

/**
 * Check if overlay exists
 * @returns {boolean}
 */
export function hasOverlay() {
  return currentOverlay !== null;
}

/**
 * Handle click outside overlay
 * @param {MouseEvent} event
 */
function handleClickOutside(event) {
  if (currentOverlay && !currentOverlay.contains(event.target)) {
    removeOverlay();
  }
}

/**
 * Instrument overlay (attach event listeners)
 */
function instrumentOverlay() {
  if (!currentOverlay) return;
  
  try {
    // Settings button
    const btn = currentOverlay.querySelector('.bt-gear');
    if (btn && !btn.__bt_bound) {
      btn.__bt_bound = true;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          chrome.runtime.sendMessage({ type: MSG_TYPES.OPEN_OPTIONS }, () => {});
        } catch {
          try {
            window.open(chrome.runtime.getURL('options.html'), '_blank');
          } catch {}
        }
      });
    }
    
    // Drag handle
    const handle = currentOverlay.querySelector('.bt-drag');
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

/**
 * Get selection coordinates for overlay positioning
 * @param {Event} event Optional event with pageX/pageY
 * @returns {{ x: number, y: number }}
 */
export function getSelectionCoordinates(event) {
  // Prefer event coordinates
  const ex = Number.isFinite(event?.pageX) ? event.pageX : null;
  const ey = Number.isFinite(event?.pageY) ? event.pageY : null;
  if (ex != null && ey != null) return { x: ex, y: ey };
  
  // Fallback to selection bounding rect
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
  
  // Final fallback
  return { x: 16 + window.scrollX, y: 16 + window.scrollY };
}
