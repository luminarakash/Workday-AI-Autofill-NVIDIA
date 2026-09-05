/**
 * dom-utils.js
 * Low-level DOM helpers shared by mapper.js, filler.js, navigator.js.
 * Workday's SPA re-renders sections dynamically and occasionally uses
 * shadow DOM for custom widgets, so plain querySelector is not enough.
 */
const WDDom = {
  deepQueryAll(selector, root) {
    root = root || document;
    const results = Array.prototype.slice.call(root.querySelectorAll(selector));
    const all = root.querySelectorAll("*");
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      if (el.shadowRoot) results.push.apply(results, this.deepQueryAll(selector, el.shadowRoot));
    }
    return results;
  },

  deepQuery(selector, root) {
    return this.deepQueryAll(selector, root)[0] || null;
  },

  waitForElement(selector, opts) {
    opts = opts || {};
    const timeoutMs = opts.timeoutMs || 8000;
    const root = opts.root || document;
    const self = this;
    return new Promise(function (resolve) {
      const existing = self.deepQuery(selector, root);
      if (existing) return resolve(existing);
      const observer = new MutationObserver(function () {
        const el = self.deepQuery(selector, root);
        if (el) { observer.disconnect(); resolve(el); }
      });
      observer.observe(root === document ? document.body : root, { childList: true, subtree: true });
      setTimeout(function () { observer.disconnect(); resolve(self.deepQuery(selector, root)); }, timeoutMs);
    });
  },

  waitForDomSettle(opts) {
    opts = opts || {};
    const quietMs = opts.quietMs || 600;
    const maxWaitMs = opts.maxWaitMs || 10000;
    return new Promise(function (resolve) {
      let timer = null;
      const start = Date.now();
      const observer = new MutationObserver(function () {
        if (timer) clearTimeout(timer);
        if (Date.now() - start > maxWaitMs) { observer.disconnect(); return resolve(); }
        timer = setTimeout(function () { observer.disconnect(); resolve(); }, quietMs);
      });
      observer.observe(document.body, { childList: true, subtree: true, attributes: true });
      timer = setTimeout(function () { observer.disconnect(); resolve(); }, quietMs);
    });
  },

  setNativeValue(element, value) {
    const proto = Object.getPrototypeOf(element);
    const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
    if (descriptor && descriptor.set) descriptor.set.call(element, value);
    else element.value = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));
  },

  simulateClick(element) {
    if (!element) return;
    element.scrollIntoView({ block: "center", behavior: "instant" });
    ["mousedown", "mouseup", "click"].forEach(function (type) {
      element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    });
  },

  getFieldLabel(container) {
    const label = container.querySelector("label") || container.querySelector("[data-automation-id*='label']");
    if (label) return label.innerText.trim().replace(/\*$/, "").trim();
    const aria = container.querySelector("[aria-label]");
    if (aria) return aria.getAttribute("aria-label").trim();
    return "";
  },

  isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }
};

if (typeof window !== "undefined") window.WDDom = WDDom;
