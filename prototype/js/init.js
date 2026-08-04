'use strict';

// ──────────────────────────────────────────────────────────────────────────────
// INICIALIZAÇÃO
// ──────────────────────────────────────────────────────────────────────────────
// loadAll() não é chamado diretamente aqui: cloud.js chama assim que o estado
// de autenticação resolve para um usuário logado (login salvo, ou recém-feito
// no formulário de entrada), pra garantir que stGet já enxergue o usuário
// certo antes de qualquer leitura.
