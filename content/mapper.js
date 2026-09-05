/**
 * mapper.js
 * Maps a detected Workday field to the best-fit resume value.
 * Tier 1: heuristic synonym/fuzzy matcher (fast, free, deterministic).
 * Tier 2: AI matcher (WDAiClient.mapField), used when heuristic
 * confidence is below CONFIDENCE_THRESHOLD -- covers free-text custom
 * questions and EEO/voluntary disclosure questions.
 * Fields below threshold are surfaced for user review, never guessed.
 */
const CONFIDENCE_THRESHOLD = 0.72;

const SYNONYM_MAP = [
  { keys: ["first name", "given name", "legal first name"], path: "firstName" },
  { keys: ["last name", "family name", "surname", "legal last name"], path: "lastName" },
  { keys: ["full name", "name"], path: "name" },
  { keys: ["email", "email address"], path: "email" },
  { keys: ["phone", "phone number", "mobile", "telephone"], path: "phone" },
  { keys: ["city"], path: "city" },
  { keys: ["state", "province"], path: "state" },
  { keys: ["country"], path: "country" },
  { keys: ["postal code", "zip", "zip code"], path: "zip" },
  { keys: ["address", "street address"], path: "address" },
  { keys: ["linkedin", "linkedin profile", "linkedin url"], path: "linkedin" },
  { keys: ["github", "github profile", "github url"], path: "github" },
  { keys: ["website", "portfolio", "personal website"], path: "website" },
  { keys: ["current company", "employer", "current employer"], path: "experience.0.company" },
  { keys: ["job title", "current title", "position title"], path: "experience.0.title" },
  { keys: ["school", "university", "institution"], path: "education.0.school" },
  { keys: ["degree"], path: "education.0.degree" },
  { keys: ["field of study", "major"], path: "education.0.fieldOfStudy" }
];

const BOOLEAN_QUESTION_RULES = [
  { test: /are you (currently )?(legally )?authorized to work/i,
    resolve: function (r) { return r.workAuthorization === true ? "Yes" : r.workAuthorization === false ? "No" : null; } },
  { test: /require.*(visa|sponsorship)/i,
    resolve: function (r) { return r.requiresSponsorship === true ? "Yes" : r.requiresSponsorship === false ? "No" : null; } },
  { test: /previously (worked|employed) at nvidia|current or former nvidia employee/i,
    resolve: function (r) { return r.formerNvidiaEmployee === true ? "Yes" : r.formerNvidiaEmployee === false ? "No" : null; } }
];

function getByPath(obj, path) {
  return path.split(".").reduce(function (acc, key) { return acc == null ? undefined : acc[key]; }, obj);
}
function normalize(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
}
function levenshteinRatio(a, b) {
  a = normalize(a); b = normalize(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const m = a.length, n = b.length;
  const dp = [];
  for (let i = 0; i <= m; i++) { dp.push([i]); }
  for (let j = 1; j <= n; j++) { dp[0][j] = j; }
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return 1 - dp[m][n] / Math.max(m, n);
}

const WDMapper = {
  CONFIDENCE_THRESHOLD: CONFIDENCE_THRESHOLD,

  heuristicMatch(field, resumeJson) {
    const label = normalize(field.label);

    if (field.type === "radio" || field.type === "select" || field.type === "boolean") {
      for (let i = 0; i < BOOLEAN_QUESTION_RULES.length; i++) {
        const rule = BOOLEAN_QUESTION_RULES[i];
        if (rule.test.test(field.label)) {
          const val = rule.resolve(resumeJson);
          if (val) return { value: val, confidence: 0.9, source: "heuristic-boolean" };
        }
      }
    }

    for (let i = 0; i < SYNONYM_MAP.length; i++) {
      const entry = SYNONYM_MAP[i];
      const hit = entry.keys.some(function (k) { return label === normalize(k) || label.indexOf(normalize(k)) !== -1; });
      if (hit) {
        const val = getByPath(resumeJson, entry.path);
        if (val) return { value: String(val), confidence: 0.85, source: "heuristic-synonym" };
      }
    }

    let best = { ratio: 0, entry: null };
    for (let i = 0; i < SYNONYM_MAP.length; i++) {
      const entry = SYNONYM_MAP[i];
      for (let j = 0; j < entry.keys.length; j++) {
        const ratio = levenshteinRatio(label, entry.keys[j]);
        if (ratio > best.ratio) best = { ratio: ratio, entry: entry };
      }
    }
    if (best.ratio >= 0.8 && best.entry) {
      const val = getByPath(resumeJson, best.entry.path);
      if (val) return { value: String(val), confidence: 0.6 * best.ratio, source: "heuristic-fuzzy" };
    }

    return { value: "", confidence: 0, source: "heuristic-none" };
  },

  async mapField(field, resumeJson, cache) {
    cache = cache || {};
    const cacheKey = normalize(field.label) + "::" + field.type;
    if (cache[cacheKey]) return cache[cacheKey];

    let result = this.heuristicMatch(field, resumeJson);

    if (result.confidence < CONFIDENCE_THRESHOLD) {
      try {
        const aiResult = await WDAiClient.mapField(field, resumeJson);
        if (aiResult.confidence > result.confidence) result = aiResult;
      } catch (err) {
        console.warn("[WDMapper] AI mapping failed, keeping heuristic result:", err);
      }
    }

    cache[cacheKey] = result;
    return result;
  }
};

if (typeof window !== "undefined") window.WDMapper = WDMapper;
