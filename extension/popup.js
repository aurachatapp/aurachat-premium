const BACKEND = "https://aurachat-premium-backend.onrender.com";
const EMAIL_INPUT = document.getElementById("email");
const SEND_BTN = document.getElementById("send");
const CODE_STEP = document.getElementById("step-code");
const CODE_INPUT = document.getElementById("code");
const VERIFY_BTN = document.getElementById("verify");
const STATUS_BOX = document.getElementById("statusBox");
const STATUS = document.getElementById("status");
const MSG = (t="") => (document.getElementById("msg").textContent = t);
const MSG2 = (t="") => (document.getElementById("msg2").textContent = t);

// restore saved email early
try {
  chrome.storage.local.get("lastEmail", v => {
    if (v && v.lastEmail) {
      try { EMAIL_INPUT.value = v.lastEmail; } catch {}
    }
  });
} catch {}

// live persist email on each change so it stays even if popup closed before sending
EMAIL_INPUT?.addEventListener('input', () => {
  const val = (EMAIL_INPUT.value || '').trim();
  chrome.storage.local.set({ lastEmail: val });
});

// storage helpers
const getToken = () => new Promise(r => chrome.storage.local.get("token", v => r(v.token || null)));
const setToken = (t) => new Promise(r => chrome.storage.local.set({ token: t }, () => r()));
const clearToken = () => new Promise(r => chrome.storage.local.remove(["token"], () => r()));

// small fetch with timeout and basic errors
async function call(path, opts = {}, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BACKEND}${path}`, { ...opts, signal: ctrl.signal });
    if (!res.ok) {
      // Try to parse JSON error, else generic
      let err = "request_failed";
      try { const j = await res.json(); err = j.error || err; } catch {}
      throw new Error(err);
    }
    // return JSON or empty object
    try { return await res.json(); } catch { return {}; }
  } finally {
    clearTimeout(timer);
  }
}

function showAuth() {
  document.getElementById("auth").style.display = "block";
  STATUS_BOX.style.display = "none";
}
function showStatus() {
  document.getElementById("auth").style.display = "none";
  STATUS_BOX.style.display = "block";
}

async function checkStatus() {
  const token = await getToken();
  if (!token) return showAuth();
  try {
    const data = await call("/me", { headers: { Authorization: `Bearer ${token}` } });
    STATUS.textContent = data.premium ? "Premium" : "Free";
    showStatus();
  } catch (e) {
    await clearToken();
    showAuth();
  }
}

SEND_BTN.onclick = async () => {
  MSG("");
  const email = (EMAIL_INPUT.value || "").trim();
  // persist last used email
  if (email) try { await chrome.storage.local.set({ lastEmail: email }); } catch {}
  if (!email) return MSG("Enter your email");
  try {
    await call("/auth/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    CODE_STEP.style.display = "block";
    MSG("Code sent. Check your inbox.");
  } catch (e) {
    MSG(e.message === "email_failed" ? "Could not send code" : "Network error. Try again.");
  }
};

VERIFY_BTN.onclick = async () => {
  MSG2("");
  const email = (EMAIL_INPUT.value || "").trim();
  const code = (CODE_INPUT.value || "").trim();
  if (code.length !== 6) return MSG2("Enter the 6 digits");
  try {
    const data = await call("/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code })
    });
    await setToken(data.token);
    STATUS.textContent = data.premium ? "Premium" : "Free";
    showStatus();
  } catch (e) {
    MSG2(e.message === "bad_code" ? "Wrong code" : e.message === "expired" ? "Code expired" : "Could not verify");
  }
};

document.getElementById("logout").onclick = async () => {
  await clearToken();
  showAuth();
};

checkStatus();

const API = "https://aurachat-premium-backend.onrender.com";

const emailEl = document.getElementById("email");
const sendBtn = document.getElementById("send");
const codeStep = document.getElementById("step-code");
const codeEl = document.getElementById("code");
const verifyBtn = document.getElementById("verify");
const statusBox = document.getElementById("statusBox");
const statusEl = document.getElementById("status");
const msg = (t) => document.getElementById("msg").textContent = t || "";
const msg2 = (t) => document.getElementById("msg2").textContent = t || "";

function getToken() {
  return new Promise(r => chrome.storage.local.get("token", v => r(v.token || null)));
}
function setToken(token) {
  return new Promise(r => chrome.storage.local.set({ token }, () => r()));
}
function clearToken() {
  return new Promise(r => chrome.storage.local.remove(["token"], () => r()));
}

async function checkStatus() {
  const token = await getToken();
  if (!token) return showAuth();
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

function showAuth() {
  document.getElementById("auth").style.display = "block";
  statusBox.style.display = "none";
}
function showStatus() {
  document.getElementById("auth").style.display = "none";
  statusBox.style.display = "block";
}

sendBtn.onclick = async () => {
  msg("");
  const email = emailEl.value.trim();
  // persist last used email
  if (email) try { await chrome.storage.local.set({ lastEmail: email }); } catch {}
  if (!email) return msg("Enter your email");
  const res = await fetch(`${API}/auth/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });
  if (!res.ok) return msg("Could not send code");
  codeStep.style.display = "block";
  msg("Code sent. Check your inbox.");
};

verifyBtn.onclick = async () => {
  msg2("");
  const email = emailEl.value.trim();
  const code = codeEl.value.trim();
  if (code.length !== 6) return msg2("Enter the 6 digits");
  const res = await fetch(`${API}/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code })
  });
  if (!res.ok) return msg2("Wrong code");
  const data = await res.json();
  await setToken(data.token);
  statusEl.textContent = data.premium ? "Premium" : "Free";
  showStatus();
};

document.getElementById("logout").onclick = async () => {
  await clearToken();
  showAuth();
};

checkStatus();

// restore last email on load
try {
  chrome.storage.local.get("lastEmail", v => {
    if (v && v.lastEmail) {
      try { EMAIL_INPUT.value = v.lastEmail; } catch {}
      try { emailEl.value = v.lastEmail; } catch {}
    }
  });
} catch {}