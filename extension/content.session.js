
// Listen for token from success.html and store it
window.addEventListener("message", (event) => {
  // Only accept messages from our GitHub Pages origin
  if (event.origin !== "https://aurachatapp.github.io") return;
  const d = event.data || {};
  if (d.type === "AURACH_SESSION" && typeof d.token === "string" && d.token.length > 0) {
    chrome.storage.sync.set({ session: d.token }, () => {
      chrome.runtime.sendMessage({ type: "session-updated" });
    });
  }
});
// Debug line (remove later): shows that the content script is running
console.log("AuraChat content.session.js injected on", location.href);
