'use strict';

// ──────────────────────────────────────────────────────────────────────────────
// FILTROS
// ──────────────────────────────────────────────────────────────────────────────
function getMarketFilter(){ return document.getElementById('filterMarket').value; }
function getMonthFilter(){  return document.getElementById('filterMonth').value; }

function buildMonthSelect(keep){
  const sel = document.getElementById('filterMonth');
  const cur = keep!==undefined ? keep : sel.value;
  const keys = [...new Set(trades.map(t=>monthKey(t.date)))].filter(k=>k!=='sem-data').sort().reverse();
  sel.innerHTML = '<option value="all">Todos os meses (somado)</option>' +
    keys.map(k=>`<option value="${k}">${monthLabel(k)}</option>`).join('');
  sel.value = keys.includes(cur) ? cur : 'all';
}

function applyFilters(list){
  const mkt = getMarketFilter(), mon = getMonthFilter();
  return list.filter(t=>{
    if(mkt!=='Todos' && t.market!==mkt) return false;
    if(mon!=='all'   && monthKey(t.date)!==mon) return false;
    return true;
  });
}
