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