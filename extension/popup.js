// Single, simplified implementation with persistent email
const API = "https://aurachat-premium-backend.onrender.com";

const el = (id) => document.getElementById(id);
const emailEl = el("email");
const sendBtn = el("send");
const codeEl = el("code");
const verifyBtn = el("verify");
const codeStep = el("step-code");
const statusEl = el("status");
const statusBox = el("statusBox");
const msg = (t="") => el("msg").textContent = t;
const msg2 = (t="") => el("msg2").textContent = t;

// storage helpers
const getToken = () => new Promise(r => chrome.storage.local.get("token", v => r(v.token || null)));
const setToken = (token) => new Promise(r => chrome.storage.local.set({ token }, () => r()));
const clearToken = () => new Promise(r => chrome.storage.local.remove(["token"], () => r()));
const setLastEmail = (email) => chrome.storage.local.set({ lastEmail: email });
const getLastEmail = () => new Promise(r => chrome.storage.local.get("lastEmail", v => r(v.lastEmail || "")));

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

sendBtn.onclick = async () => {
  msg("");
  const email = emailEl.value.trim();
  if (!email) return msg("Enter your email");
  await setLastEmail(email);
  try {
    await api('/auth/start', { email });
    codeStep.style.display = 'block';
    msg('Code sent. Check your inbox.');
  } catch {
    msg('Could not send code');
  }
};

verifyBtn.onclick = async () => {
  msg2("");
  const email = emailEl.value.trim();
  const code = codeEl.value.trim();
  if (code.length !== 6) return msg2('Enter the 6 digits');
  await setLastEmail(email);
  try {
    const data = await api('/auth/verify', { email, code });
    await setToken(data.token);
    statusEl.textContent = data.premium ? 'Premium' : 'Free';
    showStatus();
  } catch {
    msg2('Could not verify');
  }
};

el('logout').onclick = async () => { await clearToken(); showAuth(); };

// persist on each keystroke (debounced minimal)
let emailSaveTimer;
emailEl.addEventListener('input', () => {
  const v = emailEl.value.trim();
  clearTimeout(emailSaveTimer);
  emailSaveTimer = setTimeout(()=> setLastEmail(v), 120);
});

(async function init(){
  // restore email first
  try { const saved = await getLastEmail(); if (saved) emailEl.value = saved; } catch {}
  // if a code was already requested previously (no token yet) keep code step visible
  // we could persist that too later if desired.
  checkStatus();
})();