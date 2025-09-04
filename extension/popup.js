const BACKEND = "https://YOUR-BACKEND-URL"; 
const UPGRADE_PAGE = "https://yourdomain.com/upgrade-page/upgrade.html";
const PORTAL_LINK = "https://billing.stripe.com/p/login/eVq3co9BA8cwbmfaKF9oc00";

const elEmail = document.getElementById("email");
const elSave  = document.getElementById("saveEmail");
const elStatus= document.getElementById("status");
const btnUpg  = document.getElementById("upgrade");
const btnMng  = document.getElementById("manage");

async function getEmail() {
  return new Promise(res => chrome.storage.sync.get(["userEmail"], r => res(r.userEmail || "")));
}
async function setEmail(email) {
  return new Promise(res => chrome.storage.sync.set({ userEmail: email }, res));
}

async function refreshStatus() {
  const email = await getEmail();
  elEmail.value = email;
  if (!email) {
    elStatus.textContent = "Enter your email to check Premium";
    btnMng.style.display = "none";
    return;
  }
  elStatus.textContent = "Checking…";
  try {
    const r = await fetch(`${BACKEND}/subscription-status?email=${encodeURIComponent(email)}`);
    const data = await r.json();
    const premium = !!data.premium;

    chrome.storage.sync.set({ premium });

    if (premium) {
      elStatus.textContent = "Premium active";
      btnMng.style.display = "inline-block";
    } else {
      elStatus.textContent = "Free plan";
      btnMng.style.display = "none";
    }
  } catch (e) {
    elStatus.textContent = "Status check failed";
    btnMng.style.display = "none";
  }
}

elSave.onclick = async () => {
  const email = elEmail.value.trim().toLowerCase();
  if (!email) return;
  await setEmail(email);
  refreshStatus();
};

btnUpg.onclick = () => window.open(UPGRADE_PAGE, "_blank");
btnMng.onclick = () => window.open(PORTAL_LINK, "_blank");

refreshStatus();