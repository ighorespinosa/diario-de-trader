'use strict';

// ──────────────────────────────────────────────────────────────────────────────
// RENDER PRINCIPAL
// ──────────────────────────────────────────────────────────────────────────────
function render(){
  const full     = computeSeries();
  const mktOnly  = getMarketFilter()==='Todos' ? full : full.filter(t=>t.market===getMarketFilter());
  const filtered = applyFilters(full);

  renderReadout(full);
  renderStats(filtered);
  renderTape(filtered);
  renderResults(mktOnly, filtered);
  renderTable(filtered);
  // Gráfico: sempre POR ÚLTIMO, isolado — falha no gráfico nunca afeta a tabela (seção 8, bug 1)
  try{ renderChart(full, filtered); }
  catch(e){
    console.error('Gráfico indisponível (dados salvos normalmente):', e.message);
    const wrap = document.querySelector('.chart-wrap');
    if(wrap) wrap.innerHTML = '<div class="empty" style="padding:20px;">Gráfico indisponível. Seus dados foram salvos normalmente.</div>';
  }
}

function renderReadout(full){
  const ini = full.length ? full[0].balanceBefore : (parseFloat(capitalConfig.defaultInitial)||0);
  const atu = full.length ? full[full.length-1].balanceAfter : ini;
  const var_ = ini ? ((atu-ini)/ini*100) : 0;
  document.getElementById('capitalAtual').textContent = fmtMoney(atu);
  const el = document.getElementById('variacaoTotal');
  el.textContent = (var_>=0?'+':'')+var_.toFixed(2)+'%';
  el.className = 'rv mono ' + (var_>0?'pos':(var_<0?'neg':'neu'));
}

function renderStats(list){
  const tot = list.length, wins = list.filter(t=>t.result==='Win').length;
  const losses = list.filter(t=>t.result==='Loss').length;
  const wr = tot ? (wins/tot*100) : 0;
  document.getElementById('statsGrid').innerHTML = `
    <div class="stat-card"><div class="sl">Operações</div><div class="sv mono">${tot}</div></div>
    <div class="stat-card"><div class="sl">Taxa de acerto</div><div class="sv mono">${wr.toFixed(1)}%</div></div>
    <div class="stat-card"><div class="sl">Wins / Losses</div><div class="sv mono"><span class="pos">${wins}</span> / <span class="neg">${losses}</span></div></div>`;
}

function renderTape(list){
  const tape = document.getElementById('tape');
  if(!list.length){ tape.innerHTML = '<div class="tape-empty">Sem operações — a fita aparece aqui.</div>'; return; }
  tape.innerHTML = list.map(t=>{
    const cls = t.result==='Win'?'win':(t.result==='Loss'?'loss':'be');
    const h = t.pnlValor===0 ? 20 : Math.min(56, Math.max(14, Math.abs(t.pnlValor)/(t.balanceBefore||1)*400+14));
    return `<div class="tape-bar ${cls}" style="height:${h}px" title="${t.pair} · ${t.date} · ${t.result} · ${fmtMoney(t.pnlValor)}"></div>`;
  }).join('');
}

function renderResults(mktOnly, filtered){
  const wrap = document.getElementById('monthlyWrap');
  const head = document.getElementById('resultsHeading');
  const mon  = getMonthFilter();
  if(mon!=='all'){
    head.textContent = 'Resultados — '+monthLabel(mon);
    renderDaily(filtered, wrap);
  } else {
    head.textContent = 'Resultados mensais';
    renderMonthly(mktOnly, wrap);
  }
}

function renderDaily(list, wrap){
  if(!list.length){ wrap.innerHTML='<div class="empty" style="padding:20px 10px;">Nenhuma operação nesse período.</div>'; return; }
  const groups={};
  list.forEach(t=>{ const k=t.date||'sem-data'; (groups[k]=groups[k]||[]).push(t); });
  const rows = Object.keys(groups).sort().map(k=>{
    const day=groups[k], tot=day.length, wins=day.filter(t=>t.result==='Win').length;
    const wr=tot?(wins/tot*100):0, pnl=day.reduce((s,t)=>s+t.pnlValor,0);
    const si=day[0].balanceBefore, sf=day[day.length-1].balanceAfter, va=si?((sf-si)/si*100):0;
    return `<tr>
      <td class="mono">${k}</td><td class="mono">${tot}</td><td class="mono">${wr.toFixed(1)}%</td>
      <td class="mono ${pnl>0?'pos':pnl<0?'neg':'neu'}">${fmtMoney(pnl)}</td>
      <td class="mono ${va>0?'pos':va<0?'neg':'neu'}">${(va>=0?'+':'')+va.toFixed(2)}%</td>
      <td class="mono">${fmtMoney(sf)}</td></tr>`;
  }).join('');
  wrap.innerHTML = `<div class="tbl-wrap"><table><thead><tr>
    <th>Data</th><th>Ops.</th><th>Acerto</th><th>Resultado</th><th>Variação</th><th>Saldo final</th>
  </tr></thead><tbody>${rows}</tbody></table></div>
  <div class="hint">Resultado dia a dia. Selecione "Todos os meses" para voltar à visão geral.</div>`;
}

function renderMonthly(list, wrap){
  if(!list.length){ wrap.innerHTML='<div class="empty" style="padding:20px 10px;">Sem operações para agrupar por mês.</div>'; return; }
  const groups={};
  list.forEach(t=>{ const k=monthKey(t.date); (groups[k]=groups[k]||[]).push(t); });
  const rows = Object.keys(groups).sort().reverse().map(k=>{
    const ml=groups[k], tot=ml.length, wins=ml.filter(t=>t.result==='Win').length;
    const wr=tot?(wins/tot*100):0, pnl=ml.reduce((s,t)=>s+t.pnlValor,0);
    const si=ml[0].balanceBefore, sf=ml[ml.length-1].balanceAfter, va=si?((sf-si)/si*100):0;
    return `<tr class="month-row" data-month="${k}" style="cursor:pointer;">
      <td class="mono">${monthLabel(k)}</td><td class="mono">${tot}</td><td class="mono">${wr.toFixed(1)}%</td>
      <td class="mono ${pnl>0?'pos':pnl<0?'neg':'neu'}">${fmtMoney(pnl)}</td>
      <td class="mono ${va>0?'pos':va<0?'neg':'neu'}">${(va>=0?'+':'')+va.toFixed(2)}%</td>
      <td class="mono">${fmtMoney(sf)}</td></tr>`;
  }).join('');
  wrap.innerHTML = `<div class="tbl-wrap"><table><thead><tr>
    <th>Mês</th><th>Ops.</th><th>Acerto</th><th>Resultado</th><th>Variação</th><th>Saldo final</th>
  </tr></thead><tbody>${rows}</tbody></table></div>
  <div class="hint">Clique em um mês para ver o resultado dia a dia.</div>`;
  wrap.querySelectorAll('.month-row').forEach(row=>{
    row.addEventListener('click',()=>{
      document.getElementById('filterMonth').value = row.dataset.month;
      saveFilter(); render();
      document.getElementById('statsGrid').scrollIntoView({behavior:'smooth',block:'start'});
    });
  });
}

function renderTable(list){
  const wrap = document.getElementById('tableWrap');
  if(!list.length){
    wrap.innerHTML='<div class="empty">Nenhuma operação registrada ainda.<br><b>Clique em "+ Nova operação"</b> para começar.</div>';
    return;
  }
  const rows = [...list].reverse().map(t=>{
    const pnlCls = t.result==='Win'?'pnl-win':(t.result==='Loss'?'pnl-loss':'pnl-be');
    const setupHtml = (t.confluences&&t.confluences.length)
      ? t.confluences.map(c=>`<span class="mini-tag">${c}</span>`).join('')
      : (t.setupLegacy ? `<span class="mini-tag">${t.setupLegacy}</span>` : '—');
    const tfHtml = (t.tfMacro||t.tfGatilho) ? `<div class="tf-hint">${t.tfMacro||'—'} → ${t.tfGatilho||'—'}</div>` : '';
    return `<tr>
      <td class="mono">${t.date}${t.time?' '+t.time:''}</td>
      <td><span class="mkt-tag ${t.market}">${t.market}</span></td>
      <td>${t.pair}</td><td>${t.direction}</td>
      <td class="tc-setup">${setupHtml}${tfHtml}</td>
      <td class="mono">${t.valorEntrada ? fmtMoney(parseFloat(t.valorEntrada)) : '—'}</td>
      <td class="mono">${t.entry||'—'} / ${t.stopPrice||'—'} / ${t.exit||'—'}</td>
      <td class="${pnlCls} mono">${fmtMoney(t.pnlValor)}</td>
      <td class="mono">${fmtMoney(t.balanceAfter)}</td>
      <td class="tc-notes" style="color:var(--dim);font-size:12px;max-width:180px;">${t.notes||''}</td>
      <td class="row-actions">
        <button class="btn edit-b" data-id="${t.id}">Editar</button>
        <button class="btn danger" data-id="${t.id}">Excluir</button>
      </td></tr>`;
  }).join('');
  wrap.innerHTML = `<div class="tbl-wrap"><table class="ops">
    <thead><tr>
      <th>Data</th><th>Mercado</th><th>Par</th><th>Direção</th><th>Setup</th>
      <th>Investido</th><th>Entrada / Stop / Saída</th><th>P&L</th><th>Saldo após</th><th>Obs.</th><th></th>
    </tr></thead><tbody>${rows}</tbody></table></div>`;
  wrap.querySelectorAll('.btn.danger').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      if(editingId===btn.dataset.id){ cancelForm(); }
      trades = trades.filter(t=>t.id!==btn.dataset.id);
      await saveTrades();
      buildMonthSelect();
      render();
    });
  });
  wrap.querySelectorAll('.btn.edit-b').forEach(btn=>{
    btn.addEventListener('click', ()=>startEdit(btn.dataset.id));
  });
}
