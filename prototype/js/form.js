'use strict';

// ──────────────────────────────────────────────────────────────────────────────
// CHIPS DE CONFLUÊNCIA
// ──────────────────────────────────────────────────────────────────────────────
document.querySelectorAll('#setupChips .chip').forEach(c=>{
  c.addEventListener('click', ()=>c.classList.toggle('on'));
});
function getChips(){ return [...document.querySelectorAll('#setupChips .chip.on')].map(c=>c.dataset.v); }
function clearChips(){ document.querySelectorAll('#setupChips .chip').forEach(c=>c.classList.remove('on')); }

// ──────────────────────────────────────────────────────────────────────────────
// FORMULÁRIO — cálculo R e eventos
// ──────────────────────────────────────────────────────────────────────────────
// Fórmula exata (seção 4.1): risco=|entrada−stop|; movimento invertido em Venda;
// R=movimento/risco; ganho=valorEntrada×R
function calcR(){
  const en  = parseFloat(document.getElementById('f_entry').value);
  const sp  = parseFloat(document.getElementById('f_stop_price').value);
  const ex  = parseFloat(document.getElementById('f_exit').value);
  const dir = document.getElementById('f_direction').value;
  const ve  = parseFloat(document.getElementById('f_valor_entrada').value);
  const prev = document.getElementById('previewLine');
  if(isNaN(en)||isNaN(sp)||isNaN(ex)||isNaN(ve)){
    prev.textContent='Preencha entrada, stop, saída e valor de entrada para calcular automaticamente.';
    return;
  }
  const risco = Math.abs(en-sp);
  if(risco===0){ prev.textContent='Preço de entrada e de stop não podem ser iguais (risco ficaria zero).'; return; }
  const mov = dir==='Compra' ? (ex-en) : (en-ex);
  const R   = mov/risco;
  const gan = ve*R;
  document.getElementById('f_valor_ganho').value = gan.toFixed(2);
  prev.textContent = `R = ${R.toFixed(2)} → ${gan>=0?'+':''}${fmtMoney(gan)} sobre o valor de entrada`;
}
['f_entry','f_stop_price','f_exit','f_valor_entrada'].forEach(id=>{
  document.getElementById(id).addEventListener('input', calcR);
});
document.getElementById('f_direction').addEventListener('change', calcR);

// Abrir / fechar formulário
const form      = document.getElementById('tradeForm');
const toggleBtn = document.getElementById('toggleFormBtn');

toggleBtn.addEventListener('click', ()=>{
  const opening = !form.classList.contains('open');
  if(opening && !editingId){
    form.reset(); clearChips();
    document.getElementById('f_date').valueAsDate = new Date();
    document.getElementById('previewLine').textContent = '';
  }
  form.classList.toggle('open');
  if(form.classList.contains('open')) calcR();
});

function cancelForm(){
  form.reset(); clearChips(); form.classList.remove('open');
  document.getElementById('previewLine').textContent = '';
  document.getElementById('editBanner').classList.remove('show');
  document.getElementById('submitBtn').textContent = 'Salvar operação';
  editingId = null;
}
document.getElementById('cancelFormBtn').addEventListener('click', cancelForm);

// Editar operação existente
function startEdit(id){
  const t = trades.find(x=>x.id===id);
  if(!t) return;
  editingId = id;
  const s = v=>id=>{ document.getElementById(id).value = v||''; };
  document.getElementById('f_date').value        = t.date||'';
  document.getElementById('f_time').value        = t.time||'';
  document.getElementById('f_market').value      = t.market||'Cripto';
  document.getElementById('f_pair').value        = t.pair||'';
  document.getElementById('f_direction').value   = t.direction||'Compra';
  document.getElementById('f_valor_entrada').value = t.valorEntrada||'';
  document.getElementById('f_entry').value       = t.entry||'';
  document.getElementById('f_stop_price').value  = t.stopPrice||'';
  document.getElementById('f_exit').value        = t.exit||'';
  document.getElementById('f_tf_macro').value    = t.tfMacro||'';
  document.getElementById('f_tf_gatilho').value  = t.tfGatilho||'';
  document.getElementById('f_valor_ganho').value = t.resultInput!==undefined ? t.resultInput : '';
  document.getElementById('f_notes').value       = t.notes||'';
  clearChips();
  (t.confluences||[]).forEach(v=>{
    const c = [...document.querySelectorAll('#setupChips .chip')].find(el=>el.dataset.v===v);
    if(c) c.classList.add('on');
  });
  document.getElementById('editBanner').classList.add('show');
  document.getElementById('submitBtn').textContent = 'Salvar edição';
  form.classList.add('open');
  calcR();
  form.scrollIntoView({behavior:'smooth', block:'center'});
}

// Submeter operação (nova ou edição)
form.addEventListener('submit', async function(e){
  e.preventDefault();
  const trade = {
    id:          editingId || (Date.now().toString(36)+Math.random().toString(36).slice(2,7)),
    date:        document.getElementById('f_date').value,
    time:        document.getElementById('f_time').value,
    market:      document.getElementById('f_market').value,
    pair:        document.getElementById('f_pair').value.trim(),
    direction:   document.getElementById('f_direction').value,
    confluences: getChips(),
    tfMacro:     document.getElementById('f_tf_macro').value,
    tfGatilho:   document.getElementById('f_tf_gatilho').value,
    valorEntrada:document.getElementById('f_valor_entrada').value,
    entry:       document.getElementById('f_entry').value,
    stopPrice:   document.getElementById('f_stop_price').value,
    exit:        document.getElementById('f_exit').value,
    resultMode:  'valor',
    resultInput: parseFloat(document.getElementById('f_valor_ganho').value)||0,
    notes:       document.getElementById('f_notes').value.trim()
  };
  if(editingId){
    trades = trades.map(t=> t.id===editingId ? trade : t);
  } else {
    trades.push(trade);
  }
  await saveTrades();
  buildMonthSelect();
  cancelForm();
  render();
});

// ──────────────────────────────────────────────────────────────────────────────
// FILTROS
// ──────────────────────────────────────────────────────────────────────────────
document.getElementById('filterMarket').addEventListener('change', ()=>{ saveFilter(); render(); });
document.getElementById('filterMonth').addEventListener('change',  ()=>{ saveFilter(); render(); });
