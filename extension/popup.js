// Robust dynamic implementation with event delegation (handles late‑loaded DOM)
const API = "https://aurachat-premium-backend.onrender.com";
const DEBUG = true;
const log = (...a)=>DEBUG&&console.log('[AUTH]',...a);
const msg = (t="") => { const n=document.getElementById('msg'); if(n) n.textContent=t; };
const msg2= (t="") => { const n=document.getElementById('msg2');if(n) n.textContent=t; };

// storage helpers
const getToken = () => new Promise(r=>chrome.storage.local.get('token',v=>r(v.token||null)));
const setToken = (token) => new Promise(r=>chrome.storage.local.set({token},()=>r()));
const clearToken = () => new Promise(r=>chrome.storage.local.remove(['token'],()=>r()));
const savePendingToken = (pendingToken) => new Promise(r=>chrome.storage.local.set({pendingToken},()=>r()));
const getPendingToken   = () => new Promise(r=>chrome.storage.local.get('pendingToken',v=>r(v.pendingToken||null)));
const clearPendingToken = () => new Promise(r=>chrome.storage.local.remove(['pendingToken'],()=>r()));
const saveLastEmail = (email) => new Promise(r=>chrome.storage.local.set({lastEmail:email},()=>r()));
const loadLastEmail = () => new Promise(r=>chrome.storage.local.get('lastEmail',v=>r(v.lastEmail||'')));

// dynamic finders
const findEmailInput = () => document.getElementById('email')||[...document.querySelectorAll('input')].find(i=>i.type==='email'||/email/i.test(i.placeholder)||/@/.test(i.value));
const findCodeInput  = () => document.getElementById('code') ||[...document.querySelectorAll('input')].find(i=>i.maxLength===6||/digit/i.test(i.placeholder)||/^[0-9]{6}$/.test(i.value));
const findSendBtn    = () => document.getElementById('send') ||[...document.querySelectorAll('button')].find(b=>/send code/i.test(b.textContent)||/^send$/i.test(b.textContent.trim()));
const findVerifyBtn  = () => document.getElementById('verify')||[...document.querySelectorAll('button')].find(b=>/verify/i.test(b.textContent));
const findStatusEl   = () => document.getElementById('status');
const findStatusBox  = () => document.getElementById('statusBox');
const findAuthBox    = () => document.getElementById('auth');
const findCodeStep   = () => document.getElementById('step-code');

function showAuth(){ const a=findAuthBox(),sb=findStatusBox(); if(a) a.style.display='block'; if(sb) sb.style.display='none'; }
function showStatus(){ const a=findAuthBox(),sb=findStatusBox(); if(a) a.style.display='none'; if(sb) sb.style.display='block'; }

async function api(path,body){
  const res = await fetch(`${API}${path}`,{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body||{}) });
  let data={}; try{ data=await res.json(); }catch{}
  if(!res.ok){ const err=new Error(data.error||'request_failed'); throw err; }
  return data;
}

async function checkStatus(){
  const token = await getToken();
  if(!token){ showAuth(); return; }
  try{
    const res = await fetch(`${API}/me`,{ headers:{ Authorization:`Bearer ${token}` }});
    if(!res.ok) throw 0;
    const data = await res.json();
    const s = findStatusEl(); if(s) s.textContent = data.premium ? 'Premium':'Free';
    showStatus();
  }catch{ await clearToken(); showAuth(); }
}

// delegate input events for email persistence
document.addEventListener('input', async e => {
  if(e.target === findEmailInput()){
    const v=(e.target.value||'').trim().toLowerCase();
    await saveLastEmail(v);
  }
});

// delegate clicks for send / verify / logout
document.addEventListener('click', async e => {
  const sendBtn = findSendBtn();
  const verifyBtn = findVerifyBtn();
  const emailInput = findEmailInput();
  const codeInput = findCodeInput();

  // SEND
  if(e.target === sendBtn){
    msg('');
    const email = (emailInput?.value||'').trim().toLowerCase();
    if(!email) return msg('Enter your email');
    if(emailInput) emailInput.value=email;
    await saveLastEmail(email);
    try {
      let resp;
      try { resp = await api('/auth/send-code',{ email }); log('send-code resp',resp); }
      catch(err){ log('send-code failed fallback start',err); resp = await api('/auth/start',{ email }); }
      if(resp?.token){ await savePendingToken(resp.token); log('saved pendingToken JWT'); }
      else if(resp?.pendingToken){ await savePendingToken(resp.pendingToken); log('saved pendingToken legacy'); }
      else { log('WARNING no token in response'); }
      const cs = findCodeStep(); if(cs) cs.style.display='block';
      msg('Code sent. Check inbox.');
    } catch(err){ log('send error',err); msg(err.message||'Send failed'); }
  }

  // VERIFY
  if(e.target === verifyBtn){
    msg2('');
    let email = (emailInput?.value||'').trim().toLowerCase();
    if(!email){ email = (await loadLastEmail()).trim().toLowerCase(); if(emailInput) emailInput.value=email; }
    const code = (codeInput?.value||'').trim();
    if(!email) return msg2('Enter email');
    if(!/^[0-9]{6}$/.test(code)) return msg2('Enter 6 digits');
    try {
      const pendingToken = await getPendingToken();
      if(!pendingToken) return msg2('Send code first');
      const isJwt = pendingToken.split('.').length===3;
      const body = isJwt ? { token: pendingToken, code } : { email, code, pendingToken };
      log('verify body', body);
      const data = await api('/auth/verify', body);
      log('verify resp', data);
      await clearPendingToken();
      const sessionToken = data.session || data.token; if(sessionToken){ await setToken(sessionToken); log('session stored'); }
      const s=findStatusEl(); if(s) s.textContent = data.premium ? 'Premium':'Free';
      showStatus(); msg2('Verified.');
    } catch(err){ log('verify error',err); msg2(err.message||'Verify failed'); }
  }

  // LOGOUT
  if(e.target && e.target.id==='logout'){
    await clearToken(); await clearPendingToken(); showAuth();
  }
});

(async function init(){
  const lastEmail = await loadLastEmail();
  const ei = findEmailInput(); if(lastEmail && ei) ei.value = lastEmail;
  await checkStatus();
  log('init detection',{ emailInput:!!findEmailInput(), codeInput:!!findCodeInput(), sendBtn:!!findSendBtn(), verifyBtn:!!findVerifyBtn() });
})();