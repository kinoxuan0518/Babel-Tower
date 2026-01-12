/**
 * Babel Tower - Markdown Parser (Safe)
 * Converts limited markdown to HTML safely
 */

import { escapeHTML } from '../../shared/utils.js';

/**
 * Convert simple markdown to HTML with XSS protection
 * @param {string} text Markdown text
 * @returns {string} Safe HTML
 */
export function simpleMarkdown(text) {
  if (!text) return '';
  
  // First escape the text to prevent XSS
  let html = escapeHTML(text);
  
  // Then apply markdown transformations (on already-escaped text)
  html = html
    // Headers
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^#### (.*$)/gim, '<h4>$1</h4>')
    // Bold (escaped asterisks become &ast; but we match original pattern)
    .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.*?)\*/gim, '<em>$1</em>')
    // List items
    .replace(/^\s*[-*]\s+(.*$)/gim, '<li>$1</li>');
  
  // Wrap consecutive list items
  if (html.includes('<li>')) {
    html = html.replace(/<\/li>\s*<li>/g, '</li><li>');
  }
  
  // Newlines to br (except after block elements)
  html = html.replace(/\n/g, '<br>');
  html = html.replace(/(<\/h[34]>|<\/li>)\s*<br>/g, '$1');
  
  return html;
}
