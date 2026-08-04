'use strict';

// ──────────────────────────────────────────────────────────────────────────────
// ESTADO GLOBAL
// ──────────────────────────────────────────────────────────────────────────────
let trades = [];
let capitalConfig = { currency:'USD', defaultInitial:0, months:{} };
let equityChart = null;
let editingId  = null;

