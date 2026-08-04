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

auth.onAuthStateChanged((user) => {
  cloudUser = user;
  if(user){
    hideAuthOverlay();
    // loadAll() só roda uma vez por carregamento de página, na primeira vez
    // que o estado de login resolve para um usuário (login já salvo, ou
    // acabou de ser feito pelo formulário abaixo).
    if(!appStarted){ appStarted = true; loadAll(); }
  } else {
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
document.getElementById('authPassword').addEventListener('keydown', (e) => {
  if(e.key === 'Enter') document.getElementById('authLoginBtn').click();
});

document.getElementById('signOutBtn').addEventListener('click', () => {
  auth.signOut();
});
