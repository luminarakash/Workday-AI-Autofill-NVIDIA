/**
 * resumeParser.js
 * Runs in the POPUP context (has a real <input type="file"> + user
 * gesture). Extracts raw text from an uploaded PDF or DOCX via pdf.js /
 * mammoth (bundled locally under /lib, no CDN dependency), then hands
 * off to WDAiClient.structureResume() for JSON structuring.
 */
const WDResumeParser = {
  async parseFile(file) {
    const ext = file.name.split(".").pop().toLowerCase();
    let rawText = "";

    if (ext === "pdf") rawText = await this._extractPdfText(file);
    else if (ext === "docx") rawText = await this._extractDocxText(file);
    else throw new Error("Unsupported file type: ." + ext + ". Please upload a PDF or DOCX resume.");

    if (!rawText || rawText.trim().length < 20) {
      throw new Error("Could not extract readable text from this file. It may be a scanned image PDF -- try a text-based export instead.");
    }

    const structured = await WDAiClient.structureResume(rawText);
    structured.rawText = rawText;
    if (structured.name && !structured.firstName) {
      const parts = structured.name.trim().split(/\s+/);
      structured.firstName = parts[0] || "";
      structured.lastName = parts.slice(1).join(" ") || "";
    }
    return structured;
  },

  async _extractPdfText(file) {
    if (typeof pdfjsLib === "undefined") {
      await this._loadScript(chrome.runtime.getURL("lib/pdf.min.js"));
    }
    pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("lib/pdf.worker.min.js");

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let text = "";
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      text += content.items.map(function (item) { return item.str; }).join(" ") + "\n";
    }
    return text;
  },

  async _extractDocxText(file) {
    if (typeof mammoth === "undefined") {
      await this._loadScript(chrome.runtime.getURL("lib/mammoth.browser.min.js"));
    }
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
    return result.value;
  },

  _loadScript(src) {
    return new Promise(function (resolve, reject) {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = function () { reject(new Error("Failed to load " + src)); };
      document.head.appendChild(script);
    });
  }
};

if (typeof window !== "undefined") window.WDResumeParser = WDResumeParser;
