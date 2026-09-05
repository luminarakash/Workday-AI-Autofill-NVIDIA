/**
 * content.js
 * Main orchestrator injected into NVIDIA Workday job application pages.
 * Flow: popup sends AUTOFILL_STEP -> scan visible fields -> map each via
 * WDMapper -> write via WDFiller -> report filled/needsReview back to the
 * popup. Nothing here ever clicks Submit except CONFIRM_SUBMIT, which is
 * only ever sent after the popup's explicit confirmation dialog.
 */
let mappingCache = {};

async function init() {
  mappingCache = await WDStorage.getMappingCache();
  chrome.runtime.onMessage.addListener(handleMessage);
  injectStatusBadge();
}

function handleMessage(message, sender, sendResponse) {
  (async function () {
    switch (message.type) {
      case "PING":
        sendResponse({ ok: true, step: WDNavigator.detectCurrentStep() });
        break;
      case "SCAN_STEP": {
        const plan = await scanAndPlan(message.resumeJson);
        sendResponse(Object.assign({ ok: true }, plan));
        break;
      }
      case "AUTOFILL_STEP": {
        const result = await autofillCurrentStep(message.resumeJson);
        sendResponse(Object.assign({ ok: true }, result));
        break;
      }
      case "GOTO_NEXT_STEP": {
        const result = await WDNavigator.goToNextStep();
        sendResponse(Object.assign({ ok: true }, result));
        break;
      }
      case "FIND_SUBMIT_STATE": {
        const btn = WDNavigator.findSubmitButton();
        sendResponse({ ok: true, hasSubmitButton: !!btn, step: WDNavigator.detectCurrentStep() });
        break;
      }
      case "CONFIRM_SUBMIT": {
        const btn = WDNavigator.findSubmitButton();
        if (!btn) { sendResponse({ ok: false, reason: "no-submit-button-on-page" }); break; }
        WDDom.simulateClick(btn);
        await WDDom.waitForDomSettle({ quietMs: 800, maxWaitMs: 15000 });
        sendResponse({ ok: true, submitted: true });
        break;
      }
      default:
        sendResponse({ ok: false, reason: "unknown-message-type" });
    }
  })();
  return true; // keep channel open for async sendResponse
}

function scanCurrentStepFields() {
  const containers = WDDom.deepQueryAll("[data-automation-id^='formField-']").filter(WDDom.isVisible);
  const fields = [];
  for (let i = 0; i < containers.length; i++) {
    const container = containers[i];
    const label = WDDom.getFieldLabel(container);
    if (!label) continue;
    const type = classifyField(container);
    const options = type === "select" ? getSelectOptions(container) : undefined;
    fields.push({ container: container, label: label, type: type, options: options });
  }
  return fields;
}

function classifyField(container) {
  if (container.querySelector("input[type='file']")) return "file";
  if (container.querySelector("input[type='radio']")) return "radio";
  if (container.querySelector("input[type='checkbox']")) return "checkbox";
  if (container.querySelector("select")) return "select";
  if (container.querySelector("textarea")) return "textarea";
  if (container.matches("[data-automation-id*='dateSection']") || container.querySelector("[data-automation-id*='date']")) return "date";
  if (container.querySelector("button[aria-haspopup='listbox'], [data-automation-id*='dropdown']")) return "workday-dropdown";
  if (container.querySelector("input[type='text'], input:not([type])")) return "text";
  return "unknown";
}

function getSelectOptions(container) {
  const select = container.querySelector("select");
  if (!select) return [];
  return Array.prototype.slice.call(select.options).map(function (o) { return o.textContent.trim(); }).filter(Boolean);
}

async function scanAndPlan(resumeJson) {
  const fields = scanCurrentStepFields();
  const plan = [];
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    const result = await WDMapper.mapField(field, resumeJson, mappingCache);
    plan.push({ label: field.label, type: field.type, value: result.value, confidence: result.confidence, source: result.source });
  }
  await WDStorage.setMappingCache(mappingCache);
  return {
    step: WDNavigator.detectCurrentStep(),
    totalFields: fields.length,
    confidentFields: plan.filter(function (p) { return p.confidence >= WDMapper.CONFIDENCE_THRESHOLD; }).length,
    plan: plan
  };
}

async function autofillCurrentStep(resumeJson) {
  const fields = scanCurrentStepFields();
  const fieldPlan = [];
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    const result = await WDMapper.mapField(field, resumeJson, mappingCache);
    fieldPlan.push({ container: field.container, label: field.label, type: field.type, value: result.value, confidence: result.confidence, source: result.source });
  }
  await WDStorage.setMappingCache(mappingCache);

  const applied = await WDFiller.applyPlan(fieldPlan);

  await WDStorage.appendRunLog({
    step: WDNavigator.detectCurrentStep().id,
    filled: applied.filled,
    skipped: applied.skipped,
    needsReviewCount: applied.needsReview.length
  });

  return {
    step: WDNavigator.detectCurrentStep(),
    filled: applied.filled,
    skipped: applied.skipped,
    needsReview: applied.needsReview.map(function (r) {
      return { label: r.label, type: r.type, reason: r.error || "low-confidence" };
    }),
    validationErrors: WDNavigator.getValidationErrors()
  };
}

function injectStatusBadge() {
  if (document.getElementById("wd-autofill-badge")) return;
  const badge = document.createElement("div");
  badge.id = "wd-autofill-badge";
  badge.textContent = "Workday AI Autofill active";
  document.documentElement.appendChild(badge);
}

init();
