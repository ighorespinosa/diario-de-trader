'use strict';

// ──────────────────────────────────────────────────────────────────────────────
// SESSÃO / KILLZONES
// ──────────────────────────────────────────────────────────────────────────────
// As killzones são sessões reais de mercado, fixas em horário UTC. A tabela
// abaixo foi fornecida em horário local de Campo Grande (UTC-4):
//   00:00–03:00 Pausa | 03:00–05:00 Londres | 05:00–08:00 Pausa
//   08:00–12:00 Londres/NY | 12:00–18:00 NY | 17:00–19:00 Pausa
//   19:00–22:00 Ásia/Tóquio | 22:00–00:00 Pré Sydney
// (a faixa 17:00–19:00 "Pausa" propositalmente sobrepõe o fim de "NY", que
// vale até 18:00 — a entrada listada por último vence para a hora 17 local)
// — convertida aqui para UTC puro (+4h) para poder ser recalculada
// corretamente para QUALQUER fuso de referência que o usuário configurar.
const LOCATION_KEY = 'location-config';
let locationConfig = { city:'Campo Grande', state:'MS', country:'Brasil', offset:-4 };

function kzForUtcHour(h){
  h = ((h%24)+24)%24;
  if(h>=23 || h<2)  return 'Ásia/Tóquio';
  if(h<4)  return 'Pré Sydney';
  if(h<7)  return 'Pausa';
  if(h<9)  return 'Londres';
  if(h<12) return 'Pausa';
  if(h<16) return 'Londres/NY';
  if(h<21) return 'NY';
  return 'Pausa';
}
// Converte hora local (no fuso de referência configurado) para a killzone correta.
function kzForLocalHour(localHour, offset){
  const utcHour = ((Math.floor(localHour) - offset) % 24 + 24) % 24;
  return kzForUtcHour(utcHour);
}

// Gera as opções de fuso horário (UTC-12:00 a UTC+14:00, passo de 30min)
function fmtOffset(o){
  const sign = o>=0 ? '+' : '−';
  const abs = Math.abs(o);
  const h = Math.floor(abs);
  const m = Math.round((abs-h)*60);
  return `UTC${sign}${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}
function buildOffsetSelect(){
  const sel = document.getElementById('locOffset');
  if(!sel) return;
  const opts = [];
  for(let m=-12*60; m<=14*60; m+=30){ opts.push(m/60); }
  sel.innerHTML = opts.map(o=>`<option value="${o}">${fmtOffset(o)}</option>`).join('');
}

// Monta a régua de 24h dinamicamente: calcula a killzone de cada uma das 24 horas
// locais (no fuso configurado) e agrupa horas consecutivas com a mesma sessão em
// um único bloco visual — refeito sempre que a localização muda.
function buildRail(offset){
  const track = document.getElementById('kzTrack');
  if(!track) return;
  const hours = [];
  for(let h=0; h<24; h++) hours.push({ h, name: kzForLocalHour(h, offset) });
  const segs = [];
  hours.forEach(({h,name})=>{
    const last = segs[segs.length-1];
    if(last && last.name === name){ last.to = h+1; }
    else { segs.push({ from:h, to:h+1, name }); }
  });
  track.innerHTML = segs.map(s=>{
    const w = ((s.to-s.from)/24*100).toFixed(4);
    return `<div class="kz-seg${s.name?' is-zone':''}" data-from="${s.from}" data-to="${s.to}" style="width:${w}%">${s.name}</div>`;
  }).join('');
}

async function loadLocation(){
  try{
    const raw = await stGet(LOCATION_KEY);
    const p = raw ? JSON.parse(raw) : null;
    if(p) locationConfig = { ...locationConfig, ...p };
  }catch(e){ /* mantém o padrão Campo Grande */ }
  document.getElementById('locCity').value    = locationConfig.city    || '';
  document.getElementById('locState').value   = locationConfig.state  || '';
  document.getElementById('locCountry').value = locationConfig.country|| '';
  buildOffsetSelect();
  document.getElementById('locOffset').value  = locationConfig.offset;
  buildRail(locationConfig.offset);
}
async function saveLocation(){
  try{ await stSet(LOCATION_KEY, JSON.stringify(locationConfig)); }catch(e){ console.error(e); }
}

document.getElementById('saveLocationBtn').addEventListener('click', async ()=>{
  locationConfig = {
    city:    document.getElementById('locCity').value.trim()    || 'Campo Grande',
    state:   document.getElementById('locState').value.trim(),
    country: document.getElementById('locCountry').value.trim(),
    offset:  parseFloat(document.getElementById('locOffset').value)
  };
  await saveLocation();
  buildRail(locationConfig.offset);
  updateSession();
  closeSettingsModal();
});

// ---------- Modal de configuração (ícone ⚙) ----------
function openSettingsModal(){
  // repovoa os campos com o valor atualmente salvo, descartando qualquer edição
  // não salva de uma abertura anterior
  document.getElementById('locCity').value    = locationConfig.city    || '';
  document.getElementById('locState').value   = locationConfig.state  || '';
  document.getElementById('locCountry').value = locationConfig.country|| '';
  document.getElementById('locOffset').value  = locationConfig.offset;
  document.getElementById('settingsOverlay').classList.add('open');
}
function closeSettingsModal(){
  document.getElementById('settingsOverlay').classList.remove('open');
}
document.getElementById('openSettingsBtn').addEventListener('click', openSettingsModal);
document.getElementById('closeSettingsBtn').addEventListener('click', closeSettingsModal);
document.getElementById('cancelSettingsBtn').addEventListener('click', closeSettingsModal);
document.getElementById('settingsOverlay').addEventListener('click', (e)=>{
  if(e.target.id === 'settingsOverlay') closeSettingsModal();
});
document.addEventListener('keydown', (e)=>{
  if(e.key === 'Escape') closeSettingsModal();
});

function updateSession(){
  // Hora atual em UTC verdadeiro, calculada por aritmética pura — não depende do
  // banco de fusos horários (Intl/IANA) do navegador, então nunca falha nem
  // varia entre dispositivos.
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset()*60000;
  const offset = (typeof locationConfig.offset === 'number' && !isNaN(locationConfig.offset)) ? locationConfig.offset : -4;
  const refMs = utcMs + offset*3600000;
  const ref = new Date(refMs);
  const hh = ref.getUTCHours();
  const mmNum = ref.getUTCMinutes();
  const mmStr = String(mmNum).padStart(2,'0');
  const kz = kzForLocalHour(hh, offset) || 'Fora de killzone';

  // Relógio do cabeçalho: mostra horário + localização + sessão (como era antes).
  // Só o painel "Sessões de mercado" (kz-panel abaixo) fica sem a localização.
  const place = [locationConfig.city, locationConfig.state].filter(Boolean).join(', ') || 'Referência';
  const badge = document.getElementById('sessionBadge');
  if(badge) badge.innerHTML = `<span class="time">${String(hh).padStart(2,'0')}:${mmStr}</span> · ${place} &nbsp;·&nbsp; <span class="kz-label">${kz}</span>`;

  const topLbl = document.getElementById('kzTopLabel');
  if(topLbl) topLbl.textContent = 'Sessões de mercado';

  const pct = (hh*60+mmNum)/1440*100;
  const needle = document.getElementById('kzNeedle');
  if(needle) needle.style.left = pct.toFixed(3)+'%';
  const lbl = document.getElementById('kzNowLabel');
  if(lbl) lbl.textContent = `agora · ${String(hh).padStart(2,'0')}:${mmStr}`;

  document.querySelectorAll('#kzTrack .kz-seg').forEach(el=>{
    const from = parseInt(el.dataset.from,10), to = parseInt(el.dataset.to,10);
    el.classList.toggle('is-active', !!el.textContent && hh>=from && hh<to);
  });
}
updateSession();
setInterval(updateSession, 30000);
