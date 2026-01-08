// Options page logic

const CURRENCIES = [
  'CNY','USD','EUR','GBP','JPY','KRW','HKD','TWD','SGD','AUD','NZD','CAD','CHF','SEK','NOK','DKK','PLN','CZK','HUF','TRY','RUB','INR','IDR','MYR','THB','VND','PHP','BRL','MXN','ZAR','AED','SAR','QAR','OMR','BHD','KWD','ILS','UAH','RON','BGN','GEL','AMD','AZN','KZT','ARS','CLP','COP','PEN','UYU','DOP','CRC','GTQ','PYG','VES','BOB','NGN','EGP','MAD','NPR','LKR','PKR','BDT','GHS','LAK','MNT','BAM','RSD','MKD','HRK','ALL','DZD','TND','LYD','LBP','YER','IRR'
];

function $(id){ return document.getElementById(id); }

function renderCurrencyOptions(sel, current){
  sel.innerHTML = '';
  CURRENCIES.forEach(code => {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = code;
    if ((current || '').toUpperCase() === code) opt.selected = true;
    sel.appendChild(opt);
  });
}

let lastFxAt = 0;

async function init(){
  const sel = $('targetCurrency');
  const saveBtn = $('saveBtn');
  const resetBtn = $('resetBtn');
  const saveStatus = $('saveStatus');
  const refreshFxBtn = $('refreshFxBtn');
  const fxStatus = $('fxStatus');
  const explainToggle = $('explainToggle');
  const explainLang = $('explainLang');
  const physHeight = $('physHeight');
  const physWeight = $('physWeight');
  const physFoot = $('physFoot');
  const physFit = $('physFit');
  const savePhysBtn = $('savePhysBtn');
  const clearPhysBtn = $('clearPhysBtn');
  const physStatus = $('physStatus');
  const quietMode = $('quietMode');
  const anchorName = $('anchorName');
  const anchorCost = $('anchorCost');
  const anchorCurrencyHint = $('anchorCurrencyHint');
  const saveAnchorBtn = $('saveAnchorBtn');
  const clearAnchorBtn = $('clearAnchorBtn');
  const anchorStatus = $('anchorStatus');
  const llmEnable = $('llmEnable');
  const llmEndpoint = $('llmEndpoint');
  const llmModel = $('llmModel');
  const llmKey = $('llmKey');
  const llmProvider = $('llmProvider');
  const saveLlmBtn = $('saveLlmBtn');
  const clearLlmBtn = $('clearLlmBtn');
  const llmStatus = $('llmStatus');
  const llmPrefer = $('llmPrefer');
  const testLlmBtn = $('testLlmBtn');
  const showTranslation = $('showTranslation');
  const translationLang = $('translationLang');

  // Provider presets (OpenAI-compatible)
  const LLM_PRESETS = {
    openai: {
      name: 'OpenAI', endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini'
    },
    deepseek: {
      name: 'DeepSeek', endpoint: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat'
    },
    moonshot: {
      name: 'Moonshot', endpoint: 'https://api.moonshot.cn/v1/chat/completions', model: 'moonshot-v1-8k'
    },
    groq: {
      name: 'Groq', endpoint: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.1-70b-versatile'
    },
    together: {
      name: 'Together', endpoint: 'https://api.together.xyz/v1/chat/completions', model: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo'
    },
    perplexity: {
      name: 'Perplexity', endpoint: 'https://api.perplexity.ai/chat/completions', model: 'pplx-70b-online'
    },
    custom: { name: '自定义', endpoint: '', model: '' }
  };

  function applyPreset(providerKey) {
    const p = LLM_PRESETS[providerKey] || LLM_PRESETS.custom;
    if (providerKey !== 'custom') {
      llmEndpoint.value = p.endpoint;
      llmModel.value = p.model;
    }
  }

  // load current setting
  chrome.storage.local.get([
    'bt_targetCurrency','fx_lastUpdated','fx_source','fxToCNY','fx_fetching','fx_fetch_error',
    'bt_anchor_unit', 'bt_explain_enabled', 'bt_explain_lang', 'bt_llm', 'bt_user_physical', 'bt_llm_prefer', 'bt_quiet_mode', 'bt_show_translation', 'bt_translation_lang'
  ], (res) => {
    const cur = (res.bt_targetCurrency || '').toUpperCase();
    renderCurrencyOptions(sel, cur || 'CNY');
    anchorCurrencyHint.textContent = (cur || 'CNY');
    if (res.fx_lastUpdated) {
      const dt = new Date(res.fx_lastUpdated);
      const count = res.fxToCNY ? Object.keys(res.fxToCNY).length : 0;
      fxStatus.textContent = `来源: ${res.fx_source || 'exchangerate.host'} • 更新时间: ${dt.toLocaleString()} • 覆盖币种: ${count}`;
      lastFxAt = +res.fx_lastUpdated || 0;
    } else {
      fxStatus.textContent = '尚无实时汇率，已使用内置近似值（联网后将自动更新）';
    }
    if (res.fx_fetching) {
      fxStatus.textContent = '正在刷新…';
    }
    if (res.fx_fetch_error) {
      fxStatus.textContent = '刷新失败：' + res.fx_fetch_error;
      fxStatus.className = 'muted warn';
    }
    if (res.bt_anchor_unit) {
      anchorName.value = res.bt_anchor_unit.name || '';
      anchorCost.value = (typeof res.bt_anchor_unit.cost === 'number' && isFinite(res.bt_anchor_unit.cost)) ? String(res.bt_anchor_unit.cost) : '';
      if (res.bt_anchor_unit.currency) {
        anchorCurrencyHint.textContent = res.bt_anchor_unit.currency;
      }
    }
    // 名词解释开关/语言
    explainToggle.checked = (typeof res.bt_explain_enabled === 'boolean') ? res.bt_explain_enabled : true;
    explainLang.value = res.bt_explain_lang || 'zh';

    // LLM 设置
    const llm = res.bt_llm || {};
    const hasLLM = !!(llm && llm.endpoint && llm.api_key);
    llmEnable.checked = hasLLM;
    // Detect provider by stored provider or endpoint
    const storedProvider = llm.provider || detectProviderByEndpoint(llm.endpoint);
    llmProvider.value = storedProvider;
    if (llm.endpoint) llmEndpoint.value = llm.endpoint; else applyPreset(storedProvider);
    if (llm.model) llmModel.value = llm.model; else applyPreset(storedProvider);
    llmKey.value = llm.api_key || '';
    setLlmInputsEnabled(llmEnable.checked);
    llmPrefer.checked = (typeof res.bt_llm_prefer === 'boolean') ? res.bt_llm_prefer : true;
    showTranslation.checked = (typeof res.bt_show_translation === 'boolean') ? res.bt_show_translation : true;
    translationLang.value = res.bt_translation_lang || res.bt_explain_lang || 'zh';

    // 身体数据
    const p = res.bt_user_physical || {};
    if (typeof p.height_cm === 'number') physHeight.value = String(p.height_cm);
    if (typeof p.weight_kg === 'number') physWeight.value = String(p.weight_kg);
    if (typeof p.foot_length_cm === 'number') physFoot.value = String(p.foot_length_cm);
    physFit.value = p.preferred_fit || 'regular';

    // Quiet mode
    quietMode.checked = (typeof res.bt_quiet_mode === 'boolean') ? res.bt_quiet_mode : true;
  });

  saveBtn.addEventListener('click', () => {
    const code = (sel.value || 'CNY').toUpperCase();
    chrome.storage.local.set({ bt_targetCurrency: code }, () => {
      saveStatus.textContent = '已保存';
      saveStatus.className = 'muted ok';
      setTimeout(() => { saveStatus.textContent = ''; saveStatus.className = 'muted'; }, 1500);
    });
  });

  resetBtn.addEventListener('click', () => {
    chrome.storage.local.remove('bt_targetCurrency', () => {
      saveStatus.textContent = '已重置为 Profile';
      saveStatus.className = 'muted ok';
      setTimeout(() => { saveStatus.textContent = ''; saveStatus.className = 'muted'; }, 1500);
    });
  });

  refreshFxBtn.addEventListener('click', () => {
    fxStatus.textContent = '正在刷新…';
    fxStatus.className = 'muted';
    const before = lastFxAt;
    const timeout = setTimeout(() => {
      if (before === lastFxAt) {
        fxStatus.textContent = '刷新超时，可能网络不通或源响应缓慢';
        fxStatus.className = 'muted warn';
      }
    }, 12000);
    chrome.runtime.sendMessage({ type: 'bt_refresh_fx' }, (ok) => {
      if (chrome.runtime.lastError) {
        fxStatus.textContent = '刷新请求发送失败';
        fxStatus.className = 'muted warn';
        return;
      }
      fxStatus.textContent = ok ? '已请求刷新，稍后自动更新' : '刷新可能失败，请稍后重试';
      // storage.onChanged 回调将更新界面并重置 lastFxAt。若 12 秒无变化，将显示超时。
    });
  });

  // 名词解释：保存当前开关/语言（即改即存）
  explainToggle.addEventListener('change', () => {
    chrome.storage.local.set({ bt_explain_enabled: !!explainToggle.checked });
  });
  explainLang.addEventListener('change', () => {
    chrome.storage.local.set({ bt_explain_lang: explainLang.value || 'zh' });
  });

  saveAnchorBtn.addEventListener('click', () => {
    const name = (anchorName.value || '').trim();
    const cost = parseFloat(anchorCost.value || '');
    if (!name) {
      anchorStatus.textContent = '请输入单位名';
      anchorStatus.className = 'muted warn';
      return;
    }
    if (!isFinite(cost) || cost <= 0) {
      anchorStatus.textContent = '请输入有效的单位成本 (> 0)';
      anchorStatus.className = 'muted warn';
      return;
    }
    chrome.storage.local.get(['bt_targetCurrency'], (res) => {
      const cur = (res.bt_targetCurrency || 'CNY').toUpperCase();
      const unit = { name, cost, currency: cur };
      chrome.storage.local.set({ bt_anchor_unit: unit }, () => {
        anchorCurrencyHint.textContent = cur;
        anchorStatus.textContent = '已保存';
        anchorStatus.className = 'muted ok';
        setTimeout(() => { anchorStatus.textContent = ''; anchorStatus.className = 'muted'; }, 1500);
      });
    });
  });

  clearAnchorBtn.addEventListener('click', () => {
    chrome.storage.local.remove('bt_anchor_unit', () => {
      anchorName.value = '';
      anchorCost.value = '';
      anchorStatus.textContent = '已清除';
      anchorStatus.className = 'muted ok';
      setTimeout(() => { anchorStatus.textContent = ''; anchorStatus.className = 'muted'; }, 1500);
    });
  });

  // LLM 保存/清除
  function setLlmInputsEnabled(on) {
    [llmProvider, llmEndpoint, llmModel, llmKey, saveLlmBtn].forEach(el => el.disabled = !on);
  }
  llmEnable.addEventListener('change', () => {
    const on = !!llmEnable.checked;
    setLlmInputsEnabled(on);
    if (!on) {
      chrome.storage.local.remove('bt_llm', () => {
        llmStatus.textContent = '已关闭并清除自定义 LLM';
        llmStatus.className = 'muted ok';
        setTimeout(() => { llmStatus.textContent=''; llmStatus.className='muted'; }, 1500);
      });
    }
  });

  llmProvider.addEventListener('change', () => {
    applyPreset(llmProvider.value);
  });

  saveLlmBtn.addEventListener('click', () => {
    if (!llmEnable.checked) {
      llmStatus.textContent = '请先开启“使用自定义 LLM”';
      llmStatus.className = 'muted warn';
      return;
    }
    const provider = llmProvider.value || 'custom';
    const endpoint = (llmEndpoint.value || '').trim();
    const model = (llmModel.value || '').trim() || 'gpt-4o-mini';
    const api_key = (llmKey.value || '').trim();
    if (!endpoint || !api_key) {
      llmStatus.textContent = '请填写 Endpoint 与 API Key';
      llmStatus.className = 'muted warn';
      return;
    }
    chrome.storage.local.set({ bt_llm: { provider, endpoint, model, api_key } }, () => {
      llmStatus.textContent = '已保存';
      llmStatus.className = 'muted ok';
      setTimeout(() => { llmStatus.textContent=''; llmStatus.className='muted'; }, 1500);
    });
  });

  clearLlmBtn.addEventListener('click', () => {
    chrome.storage.local.remove('bt_llm', () => {
      llmEnable.checked = false;
      setLlmInputsEnabled(false);
      llmStatus.textContent = '已清除';
      llmStatus.className = 'muted ok';
      setTimeout(() => { llmStatus.textContent=''; llmStatus.className='muted'; }, 1500);
    });
  });

  llmPrefer.addEventListener('change', () => {
    chrome.storage.local.set({ bt_llm_prefer: !!llmPrefer.checked });
  });

  showTranslation.addEventListener('change', () => {
    chrome.storage.local.set({ bt_show_translation: !!showTranslation.checked });
  });

  translationLang.addEventListener('change', () => {
    const v = translationLang.value || 'zh';
    chrome.storage.local.set({ bt_translation_lang: v });
  });

  // 身体数据保存/清除
  savePhysBtn.addEventListener('click', () => {
    const height_cm = parseFloat(physHeight.value || '');
    const weight_kg = parseFloat(physWeight.value || '');
    const foot_length_cm = parseFloat(physFoot.value || '');
    const preferred_fit = physFit.value || 'regular';
    const val = { preferred_fit };
    if (isFinite(height_cm)) val.height_cm = height_cm;
    if (isFinite(weight_kg)) val.weight_kg = weight_kg;
    if (isFinite(foot_length_cm)) val.foot_length_cm = foot_length_cm;
    chrome.storage.local.set({ bt_user_physical: val }, () => {
      physStatus.textContent = '已保存';
      physStatus.className = 'muted ok';
      setTimeout(() => { physStatus.textContent=''; physStatus.className='muted'; }, 1500);
    });
  });

  clearPhysBtn.addEventListener('click', () => {
    chrome.storage.local.remove('bt_user_physical', () => {
      physHeight.value = '';
      physWeight.value = '';
      physFoot.value = '';
      physFit.value = 'regular';
      physStatus.textContent = '已清除';
      physStatus.className = 'muted ok';
      setTimeout(() => { physStatus.textContent=''; physStatus.className='muted'; }, 1500);
    });
  });

  // Quiet mode toggle
  quietMode.addEventListener('change', () => {
    chrome.storage.local.set({ bt_quiet_mode: !!quietMode.checked });
  });

  testLlmBtn.addEventListener('click', () => {
    const endpoint = (llmEndpoint.value || '').trim();
    const model = (llmModel.value || '').trim() || 'gpt-4o-mini';
    const api_key = (llmKey.value || '').trim();
    if (!endpoint || !api_key) {
      llmStatus.textContent = '请填写 Endpoint 与 API Key';
      llmStatus.className = 'muted warn';
      return;
    }
    llmStatus.textContent = '测试中…';
    llmStatus.className = 'muted';
    const timeout = setTimeout(() => {
      llmStatus.textContent = '测试超时，检查网络或 CORS';
      llmStatus.className = 'muted warn';
    }, 15000);
    chrome.runtime.sendMessage({ type: 'bt_test_llm', cfg: { endpoint, model, api_key } }, (res) => {
      clearTimeout(timeout);
      if (chrome.runtime.lastError) {
        llmStatus.textContent = '发送失败：' + chrome.runtime.lastError.message;
        llmStatus.className = 'muted warn';
        return;
      }
      if (res && res.ok) {
        llmStatus.textContent = '测试成功：' + (res.sample || 'ok');
        llmStatus.className = 'muted ok';
      } else {
        llmStatus.textContent = '测试失败：' + (res && res.error || 'unknown');
        llmStatus.className = 'muted warn';
      }
    });
  });

  function detectProviderByEndpoint(endpoint) {
    const url = (endpoint || '').toLowerCase();
    if (!url) return 'openai';
    if (url.includes('openai.com')) return 'openai';
    if (url.includes('deepseek.com')) return 'deepseek';
    if (url.includes('moonshot.cn')) return 'moonshot';
    if (url.includes('api.groq.com')) return 'groq';
    if (url.includes('together.xyz')) return 'together';
    if (url.includes('perplexity.ai')) return 'perplexity';
    return 'custom';
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.fx_lastUpdated || changes.fxToCNY) {
        chrome.storage.local.get(['fx_lastUpdated','fx_source','fxToCNY'], (res) => {
          const dt = res.fx_lastUpdated ? new Date(res.fx_lastUpdated) : null;
          const count = res.fxToCNY ? Object.keys(res.fxToCNY).length : 0;
          fxStatus.textContent = dt ? `来源: ${res.fx_source || 'exchangerate.host'} • 更新时间: ${dt.toLocaleString()} • 覆盖币种: ${count}` : '尚无实时汇率';
          lastFxAt = +res.fx_lastUpdated || lastFxAt;
        });
      }
      if (changes.fx_fetching) {
        const fetching = !!changes.fx_fetching.newValue;
        if (fetching) {
          fxStatus.textContent = '正在刷新…';
          fxStatus.className = 'muted';
        }
      }
      if (changes.fx_fetch_error) {
        const err = changes.fx_fetch_error.newValue;
        if (err) {
          fxStatus.textContent = '刷新失败：' + err;
          fxStatus.className = 'muted warn';
        }
      }
      if (changes.bt_targetCurrency) {
        const cur = (changes.bt_targetCurrency.newValue || 'CNY').toUpperCase();
        anchorCurrencyHint.textContent = cur;
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
