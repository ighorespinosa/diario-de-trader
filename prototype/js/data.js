'use strict';

// ──────────────────────────────────────────────────────────────────────────────
// CARGA E MIGRAÇÃO DE DADOS
// ──────────────────────────────────────────────────────────────────────────────
async function loadAll(){
  // --- Trades ---
  try{
    const raw = await stGet(TRADES_KEY);
    trades = raw ? JSON.parse(raw) : [];
  }catch(e){ trades = []; }

  // Migração de versões antigas do app:
  trades = trades.map(t=>{
    let m = t;
    // v0: campo pnl (pré-resultInput)
    if(m.resultInput === undefined){
      const leg = parseFloat(m.pnl);
      m = {...m, resultMode:'valor', resultInput: isNaN(leg)?0:leg};
    }
    // v1: campo setup (texto livre pré-chips)
    if(m.confluences === undefined){
      m = {...m, confluences:[], tfMacro:m.tfMacro||'', tfGatilho:m.tfGatilho||'', setupLegacy:m.setup||''};
    }
    // v2: sem valorEntrada (pctBasis:'capital' preserva cálculo histórico!)
    if(m.valorEntrada === undefined){
      m = {...m, valorEntrada:'', pctBasis: m.resultMode==='percentual'?'capital':'entrada'};
    }
    return m;
  });

  // --- Capital ---
  try{
    const raw2 = await stGet(CAPITAL_KEY);
    const p = raw2 ? JSON.parse(raw2) : null;
    if(p && p.months){
      capitalConfig = p;
    } else if(p && p.initial !== undefined){
      capitalConfig = { currency:p.currency||'USD', defaultInitial:p.initial||0, months:{} };
    } else {
      capitalConfig = { currency:'USD', defaultInitial:0, months:{} };
    }
  }catch(e){ capitalConfig = { currency:'USD', defaultInitial:0, months:{} }; }

  // --- Aplicar config na UI ---
  document.getElementById('moeda').value = capitalConfig.currency || 'USD';
  document.getElementById('capMonth').value = new Date().toISOString().slice(0,7);
  syncCapitalPanel();

  // --- Localização de referência (killzone) ---
  await loadLocation();
  updateSession();

  // --- Filtros persistidos ---
  try{
    const raw3 = await stGet(FILTER_KEY);
    const f = raw3 ? JSON.parse(raw3) : null;
    if(f){
      document.getElementById('filterMarket').value = f.market || 'Todos';
      window.__savedMonth = f.month || 'all';
    }
  }catch(e){ /* sem filtro salvo */ }

  buildMonthSelect(window.__savedMonth || 'all');
  render();
}

async function saveTrades(){
  try{ await stSet(TRADES_KEY, JSON.stringify(trades)); }catch(e){ console.error(e); }
}
async function saveCapital(){
  try{ await stSet(CAPITAL_KEY, JSON.stringify(capitalConfig)); }catch(e){ console.error(e); }
}
async function saveFilter(){
  try{
    await stSet(FILTER_KEY, JSON.stringify({
      market: document.getElementById('filterMarket').value,
      month:  document.getElementById('filterMonth').value
    }));
  }catch(e){ console.error(e); }
}
