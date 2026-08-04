'use strict';

// ──────────────────────────────────────────────────────────────────────────────
// PAINEL DE CAPITAL
// ──────────────────────────────────────────────────────────────────────────────
function syncCapitalPanel(){
  const key  = document.getElementById('capMonth').value;
  const mcfg = key ? (capitalConfig.months[key]||null) : null;
  const fi   = document.getElementById('capitalInicial');
  const fm   = document.getElementById('moeda');
  const btn  = document.getElementById('saveCapitalBtn');
  if(mcfg){
    fi.value = mcfg.initial; fi.disabled = true; fm.disabled = true;
    btn.textContent='Editar'; btn.dataset.mode='edit';
  } else {
    fi.value=''; fi.disabled=false; fm.disabled=false;
    btn.textContent='Salvar capital'; btn.dataset.mode='save';
  }
}

document.getElementById('capMonth').addEventListener('change', syncCapitalPanel);

document.getElementById('saveCapitalBtn').addEventListener('click', async ()=>{
  const btn = document.getElementById('saveCapitalBtn');
  const fi  = document.getElementById('capitalInicial');
  const fm  = document.getElementById('moeda');
  if(btn.dataset.mode==='edit'){
    fi.disabled=false; fm.disabled=false;
    btn.textContent='Salvar capital'; btn.dataset.mode='save';
    return;
  }
  const key = document.getElementById('capMonth').value;
  if(!key) return;
  const ini = parseFloat(fi.value);
  capitalConfig.months[key] = { initial: isNaN(ini)?0:ini };
  capitalConfig.currency = fm.value;
  await saveCapital();
  syncCapitalPanel();
  render();
});
