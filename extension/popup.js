// Single, simplified implementation with persistent email (supports stateless JWT verification)
const API = "https://aurachat-premium-backend.onrender.com";

const el = (id) => document.getElementById(id);
const EMAIL_INPUT = el("email");
const SEND_BTN = el("send");
const CODE_INPUT = el("code");
const VERIFY_BTN = el("verify");
const codeStep = el("step-code");
const statusEl = el("status");
const statusBox = el("statusBox");
const msg = (t="") => el("msg").textContent = t;
const msg2 = (t="") => el("msg2").textContent = t;

// storage helpers
const getToken = () => new Promise(r => chrome.storage.local.get("token", v => r(v.token || null)));
const setToken = (token) => new Promise(r => chrome.storage.local.set({ token }, () => r()));
const clearToken = () => new Promise(r => chrome.storage.local.remove(["token"], () => r()));

// pendingToken helpers (needed so backend can verify even after restart)
const savePendingToken = (pendingToken) => new Promise(r => chrome.storage.local.set({ pendingToken }, () => r()));
const getPendingToken = () => new Promise(r => chrome.storage.local.get('pendingToken', v => r(v.pendingToken || null)));
const clearPendingToken = () => new Promise(r => chrome.storage.local.remove(['pendingToken'], () => r()));

// email persistence helpers
const saveLastEmail = (email) => new Promise(r => chrome.storage.local.set({ lastEmail: email }, () => r()));
const loadLastEmail = () => new Promise(r => chrome.storage.local.get('lastEmail', v => r(v.lastEmail || '')));

async function getNormalizedEmail(){
  const fromInput = (EMAIL_INPUT.value || '').trim().toLowerCase();
  if(fromInput) return fromInput;
  const fromStorage = (await loadLastEmail()).trim().toLowerCase();
  if(fromStorage){ EMAIL_INPUT.value = fromStorage; return fromStorage; }
  return '';
}

function showAuth() { el("auth").style.display = "block"; statusBox.style.display = "none"; }
function showStatus() { el("auth").style.display = "none"; statusBox.style.display = "block"; }

async function api(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {})
  });
  if (!res.ok) throw new Error("request_failed");
  return res.json().catch(()=>({}));
}

async function checkStatus() {
  const token = await getToken();
  if (!token) { showAuth(); return; }
  try {
    const res = await fetch(`${API}/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw 0;
    const data = await res.json();
    statusEl.textContent = data.premium ? "Premium" : "Free";
    showStatus();
  } catch {
    await clearToken();
    showAuth();
  }
}

// keep email saved as user types
EMAIL_INPUT.addEventListener('input', async () => {
  const e = (EMAIL_INPUT.value || '').trim().toLowerCase();
  await saveLastEmail(e);
});

// SEND CODE (prefers new stateless endpoint; falls back to legacy if needed)
SEND_BTN.onclick = async () => {
  msg('');
  const email = (EMAIL_INPUT.value || '').trim().toLowerCase();
  if(!email) return msg('Enter your email');
  EMAIL_INPUT.value = email;
  await saveLastEmail(email);
  try {
    // try stateless endpoint first
    let resp;
    try {
      resp = await api('/auth/send-code', { email });
    } catch {
      // fallback to legacy
      resp = await api('/auth/start', { email });
    }
    if(resp?.token){
      // stateless JWT method
      await savePendingToken(resp.token); // reuse same storage key
    } else if(resp?.pendingToken){
      await savePendingToken(resp.pendingToken);
    }
    codeStep.style.display = 'block';
    msg('Code sent. Check your inbox.');
  } catch (e) {
    msg(e.message === 'email_failed' ? 'Could not send code' : 'Network error. Try again.');
  }
};

// VERIFY
VERIFY_BTN.onclick = async () => {
  msg2('');
  let email = (EMAIL_INPUT.value || '').trim().toLowerCase();
  if (!email) {
    email = (await loadLastEmail()).trim().toLowerCase();
    if(email) EMAIL_INPUT.value = email;
  }
  const code = (CODE_INPUT.value || '').trim();
  if(!email) return msg2('Enter your email first');
  if(code.length !== 6) return msg2('Enter the 6 digits');
  try {
    const pendingToken = await getPendingToken();
    if(!pendingToken) return msg2('Send a new code first');
    // detect if pendingToken looks like JWT (contains two dots)
    const isJwt = pendingToken.split('.').length === 3;
    let body;
    if(isJwt){
      body = { token: pendingToken, code };
    } else {
      body = { email, code, pendingToken };
    }
    const data = await api('/auth/verify', body);
    await clearPendingToken();
    const sessionToken = data.session || data.token; // stateless or legacy
    if(sessionToken) await setToken(sessionToken);
    statusEl.textContent = data.premium ? 'Premium' : 'Free';
    showStatus();
  } catch (e) {
    msg2(
      e.message === 'bad_code' ? 'Wrong code' :
      e.message === 'expired' ? 'Code expired' :
      e.message === 'no_pending_code' ? 'Send a new code first' :
      'Could not verify'
    );
  }
};

el('logout').onclick = async () => { await clearToken(); showAuth(); };

// persist on each keystroke (debounced minimal)
let emailSaveTimer;
// (legacy listener replaced above)

(async function init(){
  // restore email first
  const lastEmail = await loadLastEmail();
  if (lastEmail) EMAIL_INPUT.value = lastEmail;
  try { const saved = await loadLastEmail(); if (saved) EMAIL_INPUT.value = saved.toLowerCase(); } catch {}
  // if a code was already requested previously (no token yet) keep code step visible
  // we could persist that too later if desired.
  checkStatus();
})();