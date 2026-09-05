/**
 * background.js (Manifest V3 service worker)
 * Minimal by design: most logic lives in the content script (direct DOM
 * access) and the popup (drives the user-facing flow). Handles install
 * lifecycle and can relay a message to a specific tab if ever needed.
 */
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    console.log("[Workday AI Autofill] Installed. Configure your AI API key (optional) in Options.");
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "RELAY_TO_TAB" && message.tabId) {
    chrome.tabs.sendMessage(message.tabId, message.payload).then(sendResponse);
    return true;
  }
  return false;
});
