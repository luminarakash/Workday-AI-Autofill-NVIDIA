/**
 * filler.js
 * Writes resolved values into the DOM for each detected field type:
 * text, native select, Workday custom dropdown, segmented date, radio,
 * checkbox, file (flagged for manual attach). Never overwrites a field
 * that already holds a valid value, and never touches Submit.
 */
const WDFiller = {
  async applyPlan(fieldPlan) {
    let filled = 0, skipped = 0;
    const needsReview = [];

    for (let i = 0; i < fieldPlan.length; i++) {
      const item = fieldPlan[i];
      try {
        if (item.confidence < WDMapper.CONFIDENCE_THRESHOLD || !item.value) {
          needsReview.push(item); skipped++; continue;
        }
        if (this._alreadyHasValidValue(item)) { skipped++; continue; }

        const success = await this._fillOne(item);
        if (success) filled++;
        else { needsReview.push(item); skipped++; }
      } catch (err) {
        console.error("[WDFiller] Failed to fill field:", item.label, err);
        needsReview.push(Object.assign({}, item, { error: String(err) }));
        skipped++;
      }
    }
    return { filled: filled, skipped: skipped, needsReview: needsReview };
  },

  _alreadyHasValidValue(item) {
    const input = item.container.querySelector("input, textarea, select");
    if (!input) return false;
    if (input.type === "checkbox" || input.type === "radio") return false;
    const current = (input.value || "").trim();
    return current.length > 0 && current.toLowerCase() !== "select one";
  },

  async _fillOne(item) {
    switch (item.type) {
      case "text": case "textarea": return this._fillText(item);
      case "select": return this._fillNativeSelect(item);
      case "workday-dropdown": return this._fillWorkdayDropdown(item);
      case "date": return this._fillDate(item);
      case "radio": return this._fillRadio(item);
      case "checkbox": return this._fillCheckbox(item);
      case "file": return this._fillFile(item);
      default:
        console.warn("[WDFiller] Unknown field type, skipping:", item.type, item.label);
        return false;
    }
  },

  _fillText(item) {
    const input = item.container.querySelector("input[type='text'], input:not([type]), textarea");
    if (!input) return false;
    WDDom.setNativeValue(input, item.value);
    return true;
  },

  _fillNativeSelect(item) {
    const select = item.container.querySelector("select");
    if (!select) return false;
    const options = Array.prototype.slice.call(select.options);
    const target = item.value.toLowerCase();
    const match = options.find(function (o) { return o.textContent.trim().toLowerCase() === target; }) ||
                  options.find(function (o) { return o.textContent.trim().toLowerCase().indexOf(target) !== -1; });
    if (!match) return false;
    select.value = match.value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  },

  async _fillWorkdayDropdown(item) {
    const trigger = item.container.querySelector("button, [data-automation-id*='dropdown'], [role='button']");
    if (!trigger) return false;
    WDDom.simulateClick(trigger);
    const listbox = await WDDom.waitForElement("[data-automation-id='promptOption'], [role='option']", { timeoutMs: 4000 });
    if (!listbox) return false;

    const options = WDDom.deepQueryAll("[data-automation-id='promptOption'], [role='option']");
    const target = item.value.toLowerCase();
    const match = options.find(function (o) { return o.textContent.trim().toLowerCase() === target; }) ||
                  options.find(function (o) { return o.textContent.trim().toLowerCase().indexOf(target) !== -1; });
    if (!match) { WDDom.simulateClick(trigger); return false; }
    WDDom.simulateClick(match);
    return true;
  },

  _fillDate(item) {
    const segments = item.container.querySelectorAll("input");
    if (segments.length < 2) return false;
    const parsed = this._parseDate(item.value);
    if (!parsed) return false;
    const values = [parsed.month, parsed.day, parsed.year].filter(function (v) { return v; });
    segments.forEach(function (seg, idx) {
      if (values[idx] !== undefined) WDDom.setNativeValue(seg, String(values[idx]));
    });
    return true;
  },

  _parseDate(value) {
    if (/present/i.test(value)) return null;
    const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return { year: iso[1], month: iso[2], day: iso[3] };
    const monthYear = value.match(/^(\d{1,2})\/(\d{4})$/);
    if (monthYear) return { year: monthYear[2], month: monthYear[1], day: "" };
    return null;
  },

  _fillRadio(item) {
    const radios = Array.prototype.slice.call(item.container.querySelectorAll("input[type='radio']"));
    const target = item.value.toLowerCase();
    const match = radios.find(function (r) {
      const labelEl = r.closest("label") || item.container.querySelector("label[for='" + r.id + "']");
      const text = ((labelEl && labelEl.innerText) || r.value || "").trim().toLowerCase();
      return text === target || text.indexOf(target) !== -1;
    });
    if (!match) return false;
    WDDom.simulateClick(match);
    return true;
  },

  _fillCheckbox(item) {
    const checkbox = item.container.querySelector("input[type='checkbox']");
    if (!checkbox) return false;
    const shouldCheck = /^(yes|true|1)$/i.test(item.value);
    if (checkbox.checked !== shouldCheck) WDDom.simulateClick(checkbox);
    return true;
  },

  _fillFile(item) {
    // File inputs can't be populated from an arbitrary path via script
    // for security reasons. Surfaced as needs-review; the popup lets the
    // user attach the resume via a real, user-initiated file picker.
    return false;
  }
};

if (typeof window !== "undefined") window.WDFiller = WDFiller;
