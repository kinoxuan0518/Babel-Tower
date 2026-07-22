/**
 * Babel Tower - LLM Client
 * Unified LLM calling through background proxy (security)
 */

import { MSG_TYPES, TIMING } from '../../shared/constants';
import { extractJSON, SimpleCache, logger } from '../../shared/utils';
import { getState } from '../state/index';
import { generatePackHeuristic } from '../heuristics/index';

// Response cache to avoid duplicate LLM calls
const llmCache = new SimpleCache(TIMING.CACHE_TTL_MS);

/**
 * Get LLM configuration
 * @returns {{ endpoint: string, api_key: string, model: string } | null}
 */
export function getLLMConfig() {
  const state = getState();
  const fileConfig = state.profile?.llm || {};
  const userConfig = state.llmConfig || {};
  
  return {
    endpoint: userConfig.endpoint || fileConfig.endpoint || '',
    api_key: userConfig.api_key || fileConfig.api_key || '',
    model: userConfig.model || fileConfig.model || 'gpt-4o-mini'
  };
}

/**
 * Check if LLM is configured and ready
 * @returns {boolean}
 */
export function hasLLM() {
  const cfg = getLLMConfig();
  return !!(cfg.endpoint && cfg.api_key);
}

/**
 * Call LLM through background service worker proxy
 * This keeps API keys secure and avoids CSP issues
 * @param {Object} params { system, user, temperature }
 * @returns {Promise<string>} Raw response content
 */
async function callLLMProxy(params) {
  const cfg = getLLMConfig();
  if (!cfg.endpoint || !cfg.api_key) {
    throw new Error('LLM config missing');
  }
  
  const { system, user, temperature = 0.2 } = params;
  const isGemini = cfg.endpoint.includes('googleapis.com');
  
  // Build request body based on provider
  let body;
  if (isGemini) {
    body = {
      contents: [{
        parts: [{ text: `${system}\n\nUser Input:\n${user}` }]
      }]
    };
  } else {
    body = {
      model: cfg.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature
    };
  }
  
  // Send through background proxy
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('LLM request timeout'));
    }, TIMING.LLM_TIMEOUT_MS);
    
    chrome.runtime.sendMessage({
      type: MSG_TYPES.CALL_LLM,
      endpoint: cfg.endpoint.split('?')[0], // Clean endpoint
      apiKey: cfg.api_key,
      body
    }, (response) => {
      clearTimeout(timeout);
      
      if (chrome.runtime.lastError) {
        const msg = chrome.runtime.lastError.message;
        if (msg.includes('invalidated')) {
          return reject(new Error('Extension updated, please refresh page'));
        }
        return reject(new Error(msg));
      }
      
      if (!response || response.error) {
        return reject(new Error(response?.error || 'Unknown background error'));
      }
      
      // Extract content based on response format
      const data = response.data;
      let content;
      
      if (data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        // Gemini format
        content = data.candidates[0].content.parts[0].text;
      } else if (data?.choices?.[0]?.message?.content) {
        // OpenAI format
        content = data.choices[0].message.content;
      }
      
      resolve(content?.trim() || '');
    });
  });
}

/**
 * Generate cognitive insight with LLM
 * @param {Object} params { selectedText, task, price, sizeCtx, lang }
 * @returns {Promise<{ text: string, anchor: string, translation?: string, visual?: string }>}
 */
export async function generateCognitiveWithLLM(params) {
  const { selectedText, task, price, sizeCtx, lang = 'zh' } = params;
  const state = getState();
  
  // Generate cache key
  const cacheKey = `cognitive:${task}:${selectedText}:${lang}`;
  const cached = llmCache.get(cacheKey);
  if (cached) {
    logger.debug('LLM cache hit:', cacheKey);
    return cached;
  }
  
  const payload = {
    selectedText,
    task: task || (price ? 'price' : (sizeCtx ? 'size' : 'term')),
    lang,
    price,
    size: sizeCtx,
    user_context: state.profile?.user_context || {},
    user_physical: state.userPhysical || {},
    anchors: {
      profile: state.profile?.cognitive_anchors || {},
      custom: state.customAnchorUnit || null
    },
    target_currency: state.targetCurrency,
    page_context: state.pageContext || {},
    page_intent: state.pageIntent || { category: 'other', user_goal: 'buying' }
  };
  
  const system = `## TONE & MANNER:
1. **CONSTRUCTIVE & WARM**: Help user make a GOOD choice. Be helpful, not just critical.
2. **ZERO META-TALK**: NEVER explain your role. Just give insights.
3. **Balanced**: Always look for the good AND the bad (Pros & Cons).

## RESPONSE FORMAT:
Return strictly JSON: {"text": string, "anchor": string}
- text: Primary insight (max 2-3 bullet points)
- anchor: A short tip or caveat

## TASK GUIDANCE:
- Task="term/feature": Explain value briefly
- Task="size" (Garment): Fit advice
- Task="size" (Packing): Compact comparison
- Task="price": Value assessment

Current user currency: ${state.targetCurrency}
Language: ${lang === 'zh' ? 'Chinese' : lang === 'en' ? 'English' : 'Bilingual'}`;

  const content = await callLLMProxy({
    system,
    user: JSON.stringify(payload),
    temperature: 0.1
  });
  
  // Parse response
  let parsed = extractJSON(content);
  
  if (!parsed || typeof parsed.text !== 'string') {
    // Fallback: treat raw content as the insight
    if (content && content.length > 5) {
      parsed = { text: content, anchor: 'Insight' };
    } else {
      throw new Error(`Parse error: ${(content || '').slice(0, 100)}`);
    }
  }
  
  const result = {
    text: parsed.text,
    anchor: parsed.anchor || '',
    translation: parsed.translation || ''
  };
  
  // Add visual component for pack dimensions
  if (task === 'size' && sizeCtx?.kind === 'pack') {
    try {
      const h = generatePackHeuristic(sizeCtx, { lang });
      if (h.visual) result.visual = h.visual;
    } catch {}
  }
  
  // Cache result
  llmCache.set(cacheKey, result);
  llmCache.prune(50);
  
  return result;
}

/**
 * Generate translation with LLM
 * @param {string} text Text to translate
 * @param {string} lang Target language (zh, en, zh-en)
 * @returns {Promise<string>}
 */
export async function generateTranslationWithLLM(text, lang = 'zh') {
  const cacheKey = `trans:${lang}:${text}`;
  const cached = llmCache.get(cacheKey);
  if (cached) return cached;
  
  const langHint = lang === 'en' ? 'English' : (lang === 'zh-en' ? 'Chinese and English bilingual' : 'Chinese');
  
  const system = `Translate the user text to ${langHint}. Return strictly JSON: {"translation": string}`;
  
  const content = await callLLMProxy({
    system,
    user: text,
    temperature: 0
  });
  
  const parsed = extractJSON(content);
  const translation = parsed?.translation ? String(parsed.translation) : '';
  
  if (translation) {
    llmCache.set(cacheKey, translation);
  }
  
  return translation;
}

/**
 * Classify page intent with LLM (for uncertain pages)
 * @param {Object} pageContext Page context
 * @returns {Promise<{ category: string, user_goal: string } | null>}
 */
export async function classifyPageIntentWithLLM(pageContext) {
  const ctx = {
    title: pageContext?.title || document.title || '',
    host: pageContext?.host || location.host || '',
    ogType: pageContext?.ogType || '',
    siteName: pageContext?.siteName || '',
    canonical: pageContext?.canonical || ''
  };
  
  const system = `Classify page intent for shopping context.
Return strictly JSON: {"category": string, "user_goal": string}.
category in {supplement, audio, clothing, furniture, electronics, other}.
user_goal in {buying, reading}. Keep it minimal.`;
  
  const content = await callLLMProxy({
    system,
    user: JSON.stringify(ctx),
    temperature: 0
  });
  
  const parsed = extractJSON(content);
  if (!parsed?.category) return null;
  
  return {
    category: String(parsed.category),
    user_goal: String(parsed.user_goal || 'buying')
  };
}
