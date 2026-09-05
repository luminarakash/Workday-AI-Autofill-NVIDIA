/**
 * navigator.js
 * Handles Workday's multi-step flow (Sign In -> My Information ->
 * My Experience -> Education -> Application Questions -> Voluntary
 * Disclosures -> Self Identify -> Review -> Submit). Step order/names
 * vary per posting, so the current step is detected by scanning visible
 * headings/breadcrumbs rather than hardcoding a fixed sequence.
 */
const STEP_SIGNATURES = [
  { id: "signin", patterns: [/sign in/i, /create account/i, /already have an account/i] },
  { id: "myInformation", patterns: [/my information/i, /contact information/i] },
  { id: "myExperience", patterns: [/my experience/i, /work experience/i, /resume\/cv/i] },
  { id: "education", patterns: [/education/i] },
  { id: "applicationQuestions", patterns: [/application questions/i] },
  { id: "voluntaryDisclosures", patterns: [/voluntary disclosures/i, /eeo/i] },
  { id: "selfIdentify", patterns: [/self identif/i, /disability/i, /veteran/i] },
  { id: "review", patterns: [/review/i, /summary/i] }
];

const WDNavigator = {
  detectCurrentStep() {
    const headingEls = WDDom.deepQueryAll(
      "h1, h2, [data-automation-id='taskName'], [data-automation-id='stepTitle'], [aria-current='step']"
    ).filter(WDDom.isVisible);
    const headingTexts = headingEls.map(function (el) { return el.innerText.trim(); }).filter(Boolean);

    for (let i = 0; i < headingTexts.length; i++) {
      const text = headingTexts[i];
      for (let j = 0; j < STEP_SIGNATURES.length; j++) {
        const step = STEP_SIGNATURES[j];
        if (step.patterns.some(function (p) { return p.test(text); })) {
          return { id: step.id, label: text };
        }
      }
    }
    return { id: "unknown", label: headingTexts[0] || document.title };
  },

  findNextButton() {
    const buttons = WDDom.deepQueryAll("button, [role='button']").filter(WDDom.isVisible);
    return buttons.find(function (b) { return /^(next|continue|save and continue)$/i.test(b.innerText.trim()); }) || null;
  },

  findSubmitButton() {
    const buttons = WDDom.deepQueryAll("button, [role='button']").filter(WDDom.isVisible);
    return buttons.find(function (b) { return /^submit$/i.test(b.innerText.trim()); }) || null;
  },

  async goToNextStep() {
    const btn = this.findNextButton();
    if (!btn) return { advanced: false, reason: "no-next-button-found" };

    const before = this.detectCurrentStep().id;
    WDDom.simulateClick(btn);
    await WDDom.waitForDomSettle({ quietMs: 700, maxWaitMs: 12000 });

    const validationErrors = this.getValidationErrors();
    if (validationErrors.length > 0) {
      return { advanced: false, reason: "validation-errors", errors: validationErrors };
    }
    const after = this.detectCurrentStep().id;
    return { advanced: after !== before, from: before, to: after };
  },

  getValidationErrors() {
    return WDDom.deepQueryAll("[data-automation-id='errorMessage'], .css-error, [role='alert']")
      .filter(WDDom.isVisible)
      .map(function (el) { return el.innerText.trim(); })
      .filter(Boolean);
  },

  findAddAnotherButton(sectionContainer) {
    sectionContainer = sectionContainer || document;
    const buttons = WDDom.deepQueryAll("button, [role='button']", sectionContainer).filter(WDDom.isVisible);
    return buttons.find(function (b) { return /^add\s/i.test(b.innerText.trim()); }) || null;
  }
};

if (typeof window !== "undefined") window.WDNavigator = WDNavigator;
