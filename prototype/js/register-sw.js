'use strict';

// Registro do service worker — habilita instalação como PWA e uso offline.
// Requer contexto seguro (https:// ou http://localhost); em file:// o
// navegador não expõe navigator.serviceWorker, então isso vira um no-op.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => {
      console.warn('Service worker não registrado:', e.message);
    });
  });
}
