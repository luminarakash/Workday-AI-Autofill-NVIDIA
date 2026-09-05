# Workday AI Autofill (NVIDIA)

A Chrome extension (Manifest V3) that parses a resume, understands an
NVIDIA Workday job application's form structure, semantically maps
resume data to form fields, and autofills the application -- stopping
for explicit human confirmation before every submission.

**Selected Workday company/application for development & testing: NVIDIA**
(`nvidia.wd5.myworkdayjobs.com`), per the assignment's instruction to
focus on one of the four provided postings.

---

## 1. Setup

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this project's root folder.
4. Open any NVIDIA Workday job posting, e.g.:
   `https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/Israel-Raanana/SONiC-Software-Engineer---Python_JR2017236`
5. Click the extension icon to open the popup.

No build step is required to *run* the extension -- all JS is plain
ES2020+, and the Tailwind CSS used by the popup/options pages is
pre-compiled into `styles/tailwind.css`. A build step is only needed
if you want to change the Tailwind classes (see "Rebuilding styles"
below).

### Optional: enable real AI mapping

By default the extension runs in **mock mode**: a deterministic
heuristic matcher (synonym dictionary + fuzzy label matching) handles
resume structuring and field mapping with zero API cost. To switch on
real AI-based semantic mapping:

1. Click **API settings** in the popup footer (or right-click the
   extension icon -> Options).
2. Enter an OpenAI (or OpenAI-compatible) API key, model, and endpoint.
3. Save. No other code or config changes are needed -- `aiClient.js`
   reads the stored config live on every call and automatically stops
   using the mock path once a key is present.

---

## 2. Architecture

```
manifest.json          Manifest V3 config
background.js          Service worker (install lifecycle, tab relay)

utils/
  storage.js            chrome.storage.local wrapper (resume, API config,
                         mapping cache, run log)
  aiClient.js            Single entry point for all AI calls; mock fallback
  resumeParser.js         Runs in popup context; PDF/DOCX -> raw text -> AI JSON

content/                 Injected into nvidia.wd5.myworkdayjobs.com
  dom-utils.js            Shadow-DOM-aware queries, MutationObserver waits,
                          native input value setting, click simulation
  mapper.js               Field label -> resume value (heuristic + AI tiers)
  filler.js               Writes values into text/select/dropdown/date/
                          radio/checkbox widgets; never overwrites valid data
  navigator.js             Detects current Workday step, clicks Next,
                          surfaces validation errors, never clicks Submit
  content.js               Orchestrator: scan -> map -> fill -> report,
                          message router for the popup

popup/                   React-free, Tailwind-styled UI
  popup.html / popup.js    Resume upload, scan, autofill, review, submit
                          (submit requires an explicit confirm dialog)

options/                 Tailwind-styled settings page
  options.html / options.js  AI provider / API key / model / endpoint

lib/                     Bundled locally, no CDN dependency
  pdf.min.js, pdf.worker.min.js    pdf.js (Mozilla), for PDF text extraction
  mammoth.browser.min.js            mammoth.js, for DOCX text extraction

styles/
  tailwind.css            Pre-compiled Tailwind utility CSS used by
                          popup.html and options.html
```

### Data flow (one autofill pass)

1. **Resume upload (popup)** -- user selects a PDF/DOCX. `resumeParser.js`
   extracts raw text locally (pdf.js / mammoth), then calls
   `WDAiClient.structureResume()` to get structured JSON (mock regex-based
   extraction if no API key is set, otherwise a real LLM call).
2. **Scan (content script)** -- `content.js` finds every visible
   `[data-automation-id^="formField-"]` container on the current Workday
   step and classifies each by its inner widget (text, select, Workday
   custom dropdown, date, radio, checkbox, file).
3. **Map (mapper.js)** -- for each field, a synonym/fuzzy heuristic match
   is tried first (free, instant). If confidence is below the threshold
   (0.72), `WDAiClient.mapField()` is called for AI-based semantic
   mapping, including EEO/voluntary-disclosure Yes/No questions where a
   confident answer can be derived from resume/profile data.
4. **Fill (filler.js)** -- only fields at or above the confidence
   threshold get written, using real `input`/`change`/`blur` events so
   Workday's React-controlled inputs register the change. Fields that
   already contain a valid, non-placeholder value are left untouched.
5. **Review (popup)** -- filled count, skipped count, and every
   low-confidence field are shown in the popup for manual completion.
6. **Navigate (navigator.js)** -- "Next"/"Continue" is only clicked from
   the popup's explicit button; if Workday shows inline validation
   errors after the click, they're surfaced instead of silently retried.
7. **Submit** -- the popup's Submit button always opens a confirmation
   dialog first ("Yes, submit now"); only that explicit click sends
   `CONFIRM_SUBMIT` to the content script, which is the only code path
   in the entire extension allowed to click Workday's real Submit button.

---

## 3. AI Strategy

- **Two-tier mapping**: heuristic-first, AI-escalation-second. This keeps
  the extension fast, cheap, and usable with zero API key, while still
  handling free-text/custom questions and ambiguous labels via AI when
  the deterministic pass isn't confident.
- **Confidence-gated autofill**: every mapping result carries a
  confidence score (0-1). Only scores >= 0.72 are auto-filled; everything
  else is queued for human review rather than guessed -- directly
  addressing the assignment's requirement to avoid overwriting valid
  data and to fail safely on ambiguous fields.
- **EEO / voluntary disclosure questions**: handled by a small, explicit
  rule set that only answers from data the candidate's own resume/profile
  actually states (e.g. work authorization, sponsorship needs) -- never
  inferred or guessed from unrelated signals. Per the assignment's note,
  not every such question is expected to be answered; only ones a
  confident answer can be derived for.
- **Mock mode by design**: `aiClient.js` isolates every network call
  behind a single module. With no API key configured, deterministic
  mock functions (regex extraction + the same heuristic matcher used by
  the real path) stand in, so the whole pipeline -- upload, parse, scan,
  map, fill, review -- can be exercised and demoed end-to-end for free.
  Adding a real OpenAI-compatible key in Options activates the real
  `fetch()` path immediately, with no other code changes.

---

## 4. Rebuilding styles (only needed if you edit Tailwind classes)

```bash
cd wd-build   # a throwaway build folder outside the extension itself
npm install
npx tailwindcss -i ./input.css -o ../workday-autofill/styles/tailwind.css --minify
```

`tailwind.config.js` in `wd-build/` scans `popup/*.html`, `popup/*.js`,
`options/*.html`, and `options/*.js` for class names -- add new paths
there if you add new pages.

---

## 5. Known Limitations

- **Repeatable sections** ("Add another" for multiple work experiences /
  education entries): `navigator.findAddAnotherButton()` locates the
  button, but the extension currently fills only the first entry of each
  repeatable section per pass; looping through multiple entries would be
  the next iteration.
- **File upload field**: browsers block programmatically attaching an
  arbitrary local file to an `<input type="file">` for security reasons.
  The resume file must be attached via Workday's own file picker (a real
  user gesture) rather than by the extension.
- **Selector resilience**: field containers are matched primarily via
  Workday's own `data-automation-id` attributes (which are far more
  stable across releases than CSS classes), plus label-text heuristics,
  rather than brittle hardcoded CSS selectors -- but a major Workday UI
  overhaul could still require updates to `dom-utils.js`.
- **Scanned/image-only PDFs**: `resumeParser.js` extracts embedded text
  only; OCR is out of scope.
- **Single-company scope**: per the assignment's explicit allowance,
  only NVIDIA's Workday instance was implemented and tested. The
  architecture (data-automation-id-based detection, no hardcoded
  per-posting selectors) is written to generalize to Target/Philips'
  Workday instances with a `host_permissions` / `matches` update, but
  that has not been verified.
- **No backend**: entirely client-side per the assignment's Chrome
  extension architecture -- there is intentionally no server, database,
  or MERN stack involved. React + Tailwind is used only for the popup/
  options UI layer, per user request; the automation logic runs as
  vanilla JS content scripts, which is the only way it can interact
  with the live Workday page's DOM.

---

## 6. Security & Constraints Compliance

- Never bypasses authentication -- sign-in is left to the user.
- Every Submit action requires an explicit, separate confirmation click
  in the popup; nothing is ever auto-submitted.
- Resume data and API key are stored only in `chrome.storage.local`
  (never `.sync`), and the resume is never transmitted anywhere except
  the AI endpoint the user explicitly configures.
- No hardcoded CSS selectors tied to a specific Workday release --
  `data-automation-id` (Workday's own stable automation hooks) and
  visible label text are used instead.
