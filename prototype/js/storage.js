'use strict';

// ──────────────────────────────────────────────────────────────────────────────
// ARMAZENAMENTO — checagem no momento da chamada (não no parse),
// para compatibilidade com o timing de injeção do window.storage no artifact.
// ──────────────────────────────────────────────────────────────────────────────
const TRADES_KEY  = 'trades-data';
const CAPITAL_KEY = 'capital-config';
const FILTER_KEY  = 'filter-config';

async function stGet(key){
  // 1ª opção: nuvem (Firebase — cloud.js), quando há usuário logado, para
  // sincronizar entre aparelhos. Checado a cada chamada, igual às demais.
  if(typeof window.cloudGet === 'function'){
    const cloudVal = await window.cloudGet(key);
    if(cloudVal !== null && cloudVal !== undefined){
      try{ localStorage.setItem(key, cloudVal); }catch(e){ /* ok, segue só na nuvem */ }
      return cloudVal;
    }
  }
  // 2ª opção: window.storage (ambiente artifact — injetado pelo host antes dos scripts)
  if(typeof window.storage !== 'undefined' && window.storage){
    try{
      const r = await window.storage.get(key, false);
      return (r && r.value !== undefined) ? r.value : null;
    }catch(e){ /* cai para localStorage */ }
  }
  // 3ª opção: localStorage (arquivo aberto diretamente no browser, ou sem login)
  try{ return localStorage.getItem(key); }catch(e){ return null; }
}

async function stSet(key, value){
  try{ localStorage.setItem(key, value); }catch(e){ console.warn('Storage indisponível:', e); }
  // Nuvem: grava em paralelo quando há usuário logado (não bloqueia o salvamento local se falhar).
  if(typeof window.cloudSet === 'function'){ await window.cloudSet(key, value); }
  if(typeof window.storage !== 'undefined' && window.storage){
    try{ await window.storage.set(key, value, false); }catch(e){ /* já salvou local(+nuvem) */ }
  }
}

