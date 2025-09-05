const BACKEND = "https://aurachat-premium-backend.onrender.com";
const UPGRADE_PAGE = "https://aurachatapp.github.io/aurachat-premium/upgrade-page/upgrade.html";

const elStatus = document.getElementById("status");
const btnUpg = document.getElementById("upgrade");

async function getSession() {
  return new Promise(res => chrome.storage.sync.get(["session"], r => res(r.session || "")));
}

async function refreshStatus() {
  const session = await getSession();
  if (!session) {
    elStatus.textContent = "Free plan";
    return;
  }
  elStatus.textContent = "Checking…";
  try {
    const r = await fetch(`${BACKEND}/me`, {
      headers: { Authorization: `Bearer ${session}` }
    });
    const data = await r.json();
    if (data.premium) {
      elStatus.textContent = "Premium active";
    } else {
      elStatus.textContent = "Free plan";
    }
  } catch (e) {
    elStatus.textContent = "Status check failed";
  }
}

btnUpg.onclick = () => window.open(UPGRADE_PAGE, "_blank");

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "session-updated") refreshStatus();
});

refreshStatus();