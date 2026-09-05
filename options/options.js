/**
 * options.js
 * Loads/saves the AI provider config via WDStorage. Makes no API calls
 * itself -- aiClient.js reads this config live on every call.
 */
function $(id) { return document.getElementById(id); }

async function loadSettings() {
  const config = await WDStorage.getApiConfig();
  $("provider").value = config.provider || "openai";
  $("apiKey").value = config.apiKey || "";
  $("model").value = config.model || "gpt-4o-mini";
  $("endpoint").value = config.endpoint || "https://api.openai.com/v1/chat/completions";
}

$("saveBtn").addEventListener("click", async function () {
  await WDStorage.setApiConfig({
    provider: $("provider").value,
    apiKey: $("apiKey").value.trim(),
    model: $("model").value.trim() || "gpt-4o-mini",
    endpoint: $("endpoint").value.trim() || "https://api.openai.com/v1/chat/completions"
  });
  const msg = $("savedMsg");
  msg.classList.remove("hidden");
  setTimeout(function () { msg.classList.add("hidden"); }, 2000);
});

$("resetBtn").addEventListener("click", async function () {
  if (!confirm("This will clear your saved resume, API key, and run log. Continue?")) return;
  await WDStorage.clearAll();
  await loadSettings();
  alert("All local data cleared.");
});

loadSettings();
