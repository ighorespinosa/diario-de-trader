'use strict';

// ──────────────────────────────────────────────────────────────────────────────
// SINCRONIZAÇÃO ENTRE APARELHOS (Firebase Auth + Firestore)
// ──────────────────────────────────────────────────────────────────────────────
// Camada opcional acima do adaptador de storage (storage.js): quando há um
// usuário autenticado, cloudGet/cloudSet leem/gravam num documento Firestore
// por usuário (users/{uid}), além do localStorage local. Isso permite abrir o
// mesmo login no PC e no celular e ver os mesmos dados nos dois.
const firebaseConfig = {
  apiKey: "AIzaSyBtAJW9v76KXvUTER1l34J1A6vnHbIAXBA",
  authDomain: "diario-de-trader-ir.firebaseapp.com",
  projectId: "diario-de-trader-ir",
  storageBucket: "diario-de-trader-ir.firebasestorage.app",
  messagingSenderId: "314145594930",
  appId: "1:314145594930:web:c5273c55c016c6bc0ae62b"
};
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db   = firebase.firestore();

let cloudUser  = null;
let appStarted = false;

function showAuthOverlay(msg){
  document.getElementById('authError').textContent = msg || '';
  document.getElementById('authOverlay').classList.add('open');
}
function hideAuthOverlay(){
  document.getElementById('authOverlay').classList.remove('open');
}

// Lidas/gravadas por stGet/stSet (storage.js) sempre que há usuário logado.
window.cloudGet = async function(key){
  if(!cloudUser) return null;
  try{
    const snap = await db.collection('users').doc(cloudUser.uid).get();
    if(!snap.exists) return null;
    const data = snap.data();
    return (data && data[key] !== undefined) ? data[key] : null;
  }catch(e){ console.warn('cloudGet falhou:', e.message); return null; }
};

window.cloudSet = async function(key, value){
  if(!cloudUser) return;
  try{
    await db.collection('users').doc(cloudUser.uid).set({ [key]: value }, { merge:true });
  }catch(e){ console.warn('cloudSet falhou:', e.message); }
};

// Chaves de storage sincronizadas (mesmas da seção 3). Repetidas aqui em vez
// de reaproveitar as consts de storage.js/killzone.js de propósito — cloud.js
// não deve depender da ordem de carregamento dos outros módulos.
const SYNCED_KEYS = ['trades-data', 'capital-config', 'filter-config', 'location-config'];

// No primeiro login de uma conta (documento ainda não existe na nuvem), semeia
// a nuvem com o que já está salvo localmente neste aparelho — sem isso, um
// aparelho com dados só locais "some" ao logar, porque cloudGet passa a
// responder (mesmo que vazio) e stGet para de cair no localStorage.
async function seedCloudIfEmpty(){
  try{
    const ref = db.collection('users').doc(cloudUser.uid);
    const snap = await ref.get();
    if(snap.exists) return;
    const seed = {};
    SYNCED_KEYS.forEach((k) => {
      const v = localStorage.getItem(k);
      if(v !== null) seed[k] = v;
    });
    if(Object.keys(seed).length) await ref.set(seed, { merge:true });
  }catch(e){ console.warn('Semeadura inicial da nuvem falhou:', e.message); }
}

auth.onAuthStateChanged(async (user) => {
  cloudUser = user;
  if(user){
    hideAuthOverlay();
    // loadAll() só roda uma vez por carregamento de página, na primeira vez
    // que o estado de login resolve para um usuário (login já salvo, ou
    // acabou de ser feito pelo formulário abaixo).
    if(!appStarted){
      appStarted = true;
      await seedCloudIfEmpty();
      loadAll();
    }
  } else {
    // Ao deslogar (inclusive antes de criar/entrar numa outra conta): limpa o
    // cache local e a flag de início. Sem isso, o localStorage continuava com
    // os dados da conta anterior — e uma conta nova, sem documento próprio
    // ainda na nuvem, acabava sendo "semeada" com os dados de quem logou
    // antes nesse mesmo aparelho/navegador.
    SYNCED_KEYS.forEach((k) => { try{ localStorage.removeItem(k); }catch(e){ /* ok */ } });
    appStarted = false;
    showAuthOverlay();
  }
});

document.getElementById('authLoginBtn').addEventListener('click', async () => {
  const email = document.getElementById('authEmail').value.trim();
  const pass  = document.getElementById('authPassword').value;
  if(!email || !pass){ showAuthOverlay('Preencha e-mail e senha.'); return; }
  try{
    await auth.signInWithEmailAndPassword(email, pass);
  }catch(e){
    showAuthOverlay('Não foi possível entrar: ' + (e.message || 'verifique e-mail e senha.'));
  }
});
document.getElementById('authSignupBtn').addEventListener('click', async () => {
  const email = document.getElementById('authEmail').value.trim();
  const pass  = document.getElementById('authPassword').value;
  if(!email || !pass){ showAuthOverlay('Preencha e-mail e senha.'); return; }
  try{
    await auth.createUserWithEmailAndPassword(email, pass);
  }catch(e){
    showAuthOverlay('Não foi possível criar a conta: ' + (e.message || 'tente outro e-mail/senha.'));
  }
});
document.getElementById('authPassword').addEventListener('keydown', (e) => {
  if(e.key === 'Enter') document.getElementById('authLoginBtn').click();
});

document.getElementById('signOutBtn').addEventListener('click', () => {
  auth.signOut();
});

// Sobrescreve a nuvem com os 4 valores atuais de localStorage deste
// aparelho, sem checar o que já existe lá — para o usuário resolver na mão
// um caso de dados divergentes. Usado pelo botão dentro do modal ⚙ e pelo
// ícone de sincronização no cabeçalho (mesma ação, dois pontos de acesso).
async function pushLocalToCloud(){
  if(!cloudUser) throw new Error('Faça login primeiro.');
  const payload = {};
  SYNCED_KEYS.forEach((k) => {
    const v = localStorage.getItem(k);
    if(v !== null) payload[k] = v;
  });
  await db.collection('users').doc(cloudUser.uid).set(payload, { merge:true });
}

document.getElementById('forcePushBtn').addEventListener('click', async () => {
  const status = document.getElementById('forcePushStatus');
  status.textContent = 'Enviando...'; status.style.color = 'var(--dim)';
  try{
    await pushLocalToCloud();
    status.textContent = 'Enviado! Já pode abrir nos outros aparelhos.'; status.style.color = 'var(--pos)';
  }catch(e){
    status.textContent = 'Falhou: ' + e.message; status.style.color = 'var(--neg)';
  }
});

document.getElementById('syncBtn').addEventListener('click', async () => {
  try{
    await pushLocalToCloud();
    alert('Dados deste aparelho enviados para a nuvem.');
  }catch(e){
    alert('Falhou: ' + e.message);
  }
});
