'use strict';

// ──────────────────────────────────────────────────────────────────────────────
// RELATÓRIO DE IMPRESSÃO — apenas para mês específico (seção 5.7)
// ──────────────────────────────────────────────────────────────────────────────
document.getElementById('printReportBtn').addEventListener('click', ()=>{
  const mon = getMonthFilter();
  if(mon==='all'){
    alert('Selecione um mês específico no filtro "Mês" acima para gerar o relatório. Não é possível imprimir todos os meses de uma vez.');
    return;
  }
  const full = computeSeries();
  const list = applyFilters(full);
  if(!list.length){
    alert(`Não há operações registradas em ${monthLabel(mon)} para o mercado selecionado.`);
    return;
  }
  const tot=list.length, wins=list.filter(t=>t.result==='Win').length, losses=list.filter(t=>t.result==='Loss').length;
  const wr=tot?(wins/tot*100):0, pnl=list.reduce((s,t)=>s+t.pnlValor,0);
  const si=list[0].balanceBefore, sf=list[list.length-1].balanceAfter, va=si?((sf-si)/si*100):0;
  const mktLabel = getMarketFilter()==='Todos' ? 'Todos os mercados' : getMarketFilter();
  const rows = list.map(t=>`<tr>
    <td>${t.date}${t.time?' '+t.time:''}</td><td>${t.market}</td><td>${t.pair}</td><td>${t.direction}</td>
    <td>${t.valorEntrada?fmtMoney(parseFloat(t.valorEntrada)):'—'}</td>
    <td>${t.entry||'—'} / ${t.stopPrice||'—'} / ${t.exit||'—'}</td>
    <td class="${t.pnlValor>0?'pr-pos':t.pnlValor<0?'pr-neg':''}">${fmtMoney(t.pnlValor)}</td>
    <td>${fmtMoney(t.balanceAfter)}</td></tr>`).join('');
  document.getElementById('printReport').innerHTML = `
    <div class="pr-header">
      <h1>Relatório de Trade — ${monthLabel(mon)}</h1>
      <div class="pr-sub">Mercado: ${mktLabel} · Gerado em ${new Date().toLocaleDateString('pt-BR')}</div>
    </div>
    <div class="pr-stats">
      <div><div class="pr-label">Operações</div><div class="pr-value">${tot}</div></div>
      <div><div class="pr-label">Taxa de acerto</div><div class="pr-value">${wr.toFixed(1)}%</div></div>
      <div><div class="pr-label">Wins / Losses</div><div class="pr-value">${wins} / ${losses}</div></div>
      <div><div class="pr-label">Resultado do mês</div><div class="pr-value ${pnl>=0?'pr-pos':'pr-neg'}">${fmtMoney(pnl)}</div></div>
      <div><div class="pr-label">Variação no mês</div><div class="pr-value ${va>=0?'pr-pos':'pr-neg'}">${(va>=0?'+':'')+va.toFixed(2)}%</div></div>
      <div><div class="pr-label">Saldo final</div><div class="pr-value">${fmtMoney(sf)}</div></div>
    </div>
    <div class="pr-section-title">Operações de ${monthLabel(mon)}</div>
    <table>
      <thead><tr><th>Data</th><th>Mercado</th><th>Par</th><th>Direção</th>
        <th>Investido</th><th>Entrada/Stop/Saída</th><th>P&L</th><th>Saldo após</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
  window.print();
});
