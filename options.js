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
  const anchorName = $('anchorName');
  const anchorCost = $('anchorCost');
  const anchorCurrencyHint = $('anchorCurrencyHint');
  const saveAnchorBtn = $('saveAnchorBtn');
  const clearAnchorBtn = $('clearAnchorBtn');
  const anchorStatus = $('anchorStatus');

  // load current setting
  chrome.storage.local.get(['bt_targetCurrency','fx_lastUpdated','fx_source','fxToCNY','fx_fetching','fx_fetch_error','bt_anchor_unit'], (res) => {
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
