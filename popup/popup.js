/**
 * popup.js
 * Drives the popup UI. Talks to the active tab's content script via
 * chrome.tabs.sendMessage. Holds no automation logic of its own -- it
 * is pure orchestration + presentation.
 */
let currentResumeJson = null;
let activeTabId = null;

function $(id) { return document.getElementById(id); }

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function sendToContent(message) {
  if (!activeTabId) {
    const tab = await getActiveTab();
    activeTabId = tab ? tab.id : null;
  }
  return chrome.tabs.sendMessage(activeTabId, message);
}

// Tailwind's .hidden and .flex both set `display`, so for elements that
// need `flex` when shown we toggle display directly instead of relying
// on static classes.
function showFlex(el) { el.classList.remove("hidden"); el.style.display = "flex"; }
function hideFlex(el) { el.classList.add("hidden"); el.style.display = ""; }

function setStatus(connected) {
  $("statusDot").className = "w-2.5 h-2.5 rounded-full ring-2 ring-white/40 " + (connected ? "bg-green-400" : "bg-gray-300");
  $("statusDot").title = connected ? "Connected to Workday page" : "Not on a supported Workday page";
}

async function refreshStepInfo() {
  try {
    const res = await sendToContent({ type: "PING" });
    if (res && res.ok) {
      setStatus(true);
      $("stepLabel").textContent = res.step.label || res.step.id;
      $("stepSection").classList.remove("hidden");
    }
  } catch (e) {
    setStatus(false);
  }
}

$("resumeInput").addEventListener("change", async function (e) {
  const file = e.target.files[0];
  if (!file) return;
  $("parseError").classList.add("hidden");

  try {
    currentResumeJson = await WDResumeParser.parseFile(file);
    await WDStorage.setResume(currentResumeJson);

    $("noResume").classList.add("hidden");
    showFlex($("resumeLoaded"));
    $("resumeName").textContent = file.name;

    await refreshStepInfo();
    $("fillSection").classList.remove("hidden");
    $("submitSection").classList.remove("hidden");
  } catch (err) {
    $("parseError").textContent = err.message;
    $("parseError").classList.remove("hidden");
  }
});

$("clearResume").addEventListener("click", async function (e) {
  e.preventDefault();
  currentResumeJson = null;
  await WDStorage.setResume(null);
  $("resumeInput").value = "";
  $("noResume").classList.remove("hidden");
  hideFlex($("resumeLoaded"));
});

$("scanBtn").addEventListener("click", async function () {
  if (!currentResumeJson) return;
  const res = await sendToContent({ type: "SCAN_STEP", resumeJson: currentResumeJson });
  if (!res || !res.ok) return;

  $("scanSummary").classList.remove("hidden");
  $("confidentCount").textContent = res.confidentFields;
  $("totalCount").textContent = res.totalFields;
  $("stepLabel").textContent = res.step.label || res.step.id;
});

$("autofillBtn").addEventListener("click", async function () {
  if (!currentResumeJson) return;
  $("autofillBtn").disabled = true;
  $("autofillBtn").textContent = "Filling...";

  try {
    const res = await sendToContent({ type: "AUTOFILL_STEP", resumeJson: currentResumeJson });
    if (!res || !res.ok) return;

    $("fillResult").classList.remove("hidden");
    $("filledCount").textContent = res.filled;
    $("skippedCount").textContent = res.needsReview.length;

    const list = $("reviewList");
    list.innerHTML = "";
    res.needsReview.forEach(function (item) {
      const li = document.createElement("li");
      li.textContent = item.label + " -- " + (item.reason === "low-confidence" ? "no confident match, please fill manually" : item.reason);
      list.appendChild(li);
    });

    if (res.validationErrors && res.validationErrors.length) {
      res.validationErrors.forEach(function (errText) {
        const li = document.createElement("li");
        li.className = "error text-red-600";
        li.textContent = "Validation: " + errText;
        list.appendChild(li);
      });
    }

    $("nextStepBtn").classList.remove("hidden");
  } finally {
    $("autofillBtn").disabled = false;
    $("autofillBtn").textContent = "Autofill this step";
  }
});

$("nextStepBtn").addEventListener("click", async function () {
  const res = await sendToContent({ type: "GOTO_NEXT_STEP" });
  if (res && res.advanced) {
    $("fillResult").classList.add("hidden");
    $("nextStepBtn").classList.add("hidden");
    await refreshStepInfo();
  } else if (res && res.errors && res.errors.length) {
    alert("Could not advance -- please resolve:\n" + res.errors.join("\n"));
  }
});

$("submitBtn").addEventListener("click", async function () {
  const res = await sendToContent({ type: "FIND_SUBMIT_STATE" });
  if (!res || !res.hasSubmitButton) {
    alert("No Submit button found on the current page. Navigate to the final Review step first.");
    return;
  }
  showFlex($("confirmDialog"));
});

$("confirmCancel").addEventListener("click", function () {
  hideFlex($("confirmDialog"));
});

$("confirmSubmit").addEventListener("click", async function () {
  hideFlex($("confirmDialog"));
  const res = await sendToContent({ type: "CONFIRM_SUBMIT" });
  if (res && res.submitted) {
    alert("Submitted. Please verify the confirmation page.");
  } else {
    alert("Submission did not complete: " + (res && res.reason ? res.reason : "unknown error"));
  }
});

$("openOptions").addEventListener("click", function (e) {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

$("openLog").addEventListener("click", async function (e) {
  e.preventDefault();
  const log = await WDStorage.getRunLog();
  alert(log.length
    ? log.slice(-10).map(function (l) {
        return new Date(l.ts).toLocaleTimeString() + " -- " + l.step + ": " + l.filled + " filled, " + l.needsReviewCount + " to review";
      }).join("\n")
    : "No runs logged yet.");
});

(async function initPopup() {
  currentResumeJson = await WDStorage.getResume();
  if (currentResumeJson) {
    $("noResume").classList.add("hidden");
    showFlex($("resumeLoaded"));
    $("resumeName").textContent = currentResumeJson.name || "Saved resume";
    $("fillSection").classList.remove("hidden");
    $("submitSection").classList.remove("hidden");
  }
  await refreshStepInfo();
})();
