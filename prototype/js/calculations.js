'use strict';

// ──────────────────────────────────────────────────────────────────────────────
// UTILITÁRIOS
// ──────────────────────────────────────────────────────────────────────────────
function fmtMoney(v){
  const code = capitalConfig.currency==='USD' ? 'USD' : 'BRL';
  try{ return new Intl.NumberFormat('pt-BR',{style:'currency',currency:code}).format(v||0); }
  catch(e){ return (v||0).toFixed(2); }
}
function monthKey(d){ return d ? d.slice(0,7) : 'sem-data'; }
function monthLabel(k){
  if(k==='sem-data') return 'Sem data';
  const [y,m] = k.split('-');
  return ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][+m-1]+'/'+y;
}

// ──────────────────────────────────────────────────────────────────────────────
// SÉRIE DE CAPITAL — lógica exata da especificação (seção 4.3)
// ──────────────────────────────────────────────────────────────────────────────
function computeSeries(){
  const sorted = [...trades].sort((a,b)=>(a.date+(a.time||'')).localeCompare(b.date+(b.time||'')));
  let bal = parseFloat(capitalConfig.defaultInitial)||0;
  const applied = new Set();
  return sorted.map(t=>{
    const k = monthKey(t.date);
    const mcfg = capitalConfig.months ? capitalConfig.months[k] : null;
    if(mcfg!=null && !applied.has(k)){ bal = parseFloat(mcfg.initial)||0; applied.add(k); }
    const before = bal;
    let pnl;
    if(t.resultMode==='percentual'){
      const pct = (parseFloat(t.resultInput)||0)/100;
      const ve  = parseFloat(t.valorEntrada);
      pnl = (t.pctBasis==='entrada' && !isNaN(ve) && ve>0) ? ve*pct : before*pct;
    } else {
      pnl = parseFloat(t.resultInput)||0;
    }
    bal = before+pnl;
    return {...t, pnlValor:pnl, balanceBefore:before, balanceAfter:bal,
            result: pnl>0?'Win':(pnl<0?'Loss':'BE')};
  });
}
