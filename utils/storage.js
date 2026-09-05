/**
 * storage.js
 * Wrapper around chrome.storage.local. Keeps resume JSON, AI config,
 * field-mapping cache, and a run log. API key lives in .local (not
 * .sync) so it never leaves the machine via Chrome account sync.
 */
const STORAGE_KEYS = {
  RESUME_JSON: "wd_resume_json",
  API_CONFIG: "wd_api_config",
  MAPPING_CACHE: "wd_mapping_cache",
  LAST_RUN_LOG: "wd_last_run_log"
};

const WDStorage = {
  async getResume() {
    const data = await chrome.storage.local.get(STORAGE_KEYS.RESUME_JSON);
    return data[STORAGE_KEYS.RESUME_JSON] || null;
  },
  async setResume(resumeJson) {
    await chrome.storage.local.set({ [STORAGE_KEYS.RESUME_JSON]: resumeJson });
  },
  async getApiConfig() {
    const data = await chrome.storage.local.get(STORAGE_KEYS.API_CONFIG);
    return data[STORAGE_KEYS.API_CONFIG] || {
      provider: "openai",
      apiKey: "",
      model: "gpt-4o-mini",
      endpoint: "https://api.openai.com/v1/chat/completions"
    };
  },
  async setApiConfig(config) {
    await chrome.storage.local.set({ [STORAGE_KEYS.API_CONFIG]: config });
  },
  async getMappingCache() {
    const data = await chrome.storage.local.get(STORAGE_KEYS.MAPPING_CACHE);
    return data[STORAGE_KEYS.MAPPING_CACHE] || {};
  },
  async setMappingCache(cache) {
    await chrome.storage.local.set({ [STORAGE_KEYS.MAPPING_CACHE]: cache });
  },
  async appendRunLog(entry) {
    const data = await chrome.storage.local.get(STORAGE_KEYS.LAST_RUN_LOG);
    const log = data[STORAGE_KEYS.LAST_RUN_LOG] || [];
    log.push(Object.assign({}, entry, { ts: Date.now() }));
    await chrome.storage.local.set({ [STORAGE_KEYS.LAST_RUN_LOG]: log.slice(-200) });
  },
  async getRunLog() {
    const data = await chrome.storage.local.get(STORAGE_KEYS.LAST_RUN_LOG);
    return data[STORAGE_KEYS.LAST_RUN_LOG] || [];
  },
  async clearAll() {
    await chrome.storage.local.clear();
  }
};

if (typeof window !== "undefined") window.WDStorage = WDStorage;
if (typeof self !== "undefined") self.WDStorage = WDStorage;
