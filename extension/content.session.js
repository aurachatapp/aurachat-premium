window.addEventListener("message", (event) => {
  const d = event.data || {};
  if (d.type === "AURACH_SESSION" && typeof d.token === "string") {
    chrome.storage.sync.set({ session: d.token }, () => {
      chrome.runtime.sendMessage({ type: "session-updated" });
    });
  }
});
