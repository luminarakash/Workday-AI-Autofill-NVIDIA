/**
 * aiClient.js
 * Single entry point for all AI calls (resume -> JSON structuring,
 * field-label -> resume-value mapping). Falls back to a deterministic
 * MOCK implementation until a real API key is set in Options, so the
 * whole pipeline is runnable end-to-end with zero API cost. Adding a
 * key later requires no code changes -- getApiConfig() is read live.
 */
const WDAiClient = {
  async structureResume(rawText) {
    const config = await WDStorage.getApiConfig();
    if (!config.apiKey) {
      console.warn("[WDAiClient] No API key set -- using MOCK resume structuring.");
      return this._mockStructureResume(rawText);
    }
    try {
      const response = await this._callChatCompletion(config, [
        { role: "system", content: "You convert raw resume text into strict JSON matching the given schema. Respond with JSON only, no prose." },
        { role: "user", content: this._buildResumePrompt(rawText) }
      ]);
      return this._safeParseJson(response) || this._mockStructureResume(rawText);
    } catch (err) {
      console.error("[WDAiClient] structureResume failed, falling back to mock:", err);
      return this._mockStructureResume(rawText);
    }
  },

  async mapField(field, resumeJson) {
    const config = await WDStorage.getApiConfig();
    if (!config.apiKey) return this._mockMapField(field, resumeJson);
    try {
      const response = await this._callChatCompletion(config, [
        { role: "system", content: 'Map a job application form field to the best value from the resume JSON. Respond ONLY with JSON: {"value": "...", "confidence": 0-1, "reasoning": "..."}. If no confident answer exists, set value to "" and confidence to 0.' },
        { role: "user", content: this._buildMappingPrompt(field, resumeJson) }
      ]);
      const parsed = this._safeParseJson(response);
      if (parsed && typeof parsed.value === "string") {
        return { value: parsed.value, confidence: parsed.confidence == null ? 0.5 : parsed.confidence, source: "ai" };
      }
      return this._mockMapField(field, resumeJson);
    } catch (err) {
      console.error("[WDAiClient] mapField failed, falling back to mock:", err);
      return this._mockMapField(field, resumeJson);
    }
  },

  async _callChatCompletion(config, messages) {
    const res = await fetch(config.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + config.apiKey },
      body: JSON.stringify({ model: config.model || "gpt-4o-mini", messages, temperature: 0.1, response_format: { type: "json_object" } })
    });
    if (!res.ok) throw new Error("AI API error " + res.status + ": " + (await res.text()));
    const data = await res.json();
    return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
  },

  _buildResumePrompt(rawText) {
    return "Resume text:\n---\n" + rawText + "\n---\nReturn JSON with keys: name, email, phone, location, linkedin, github, summary, experience (array of {title, company, location, startDate, endDate, description}), education (array of {degree, school, location, startDate, endDate}), skills (array of strings), certifications (array of strings).";
  },

  _buildMappingPrompt(field, resumeJson) {
    return 'Form field label: "' + field.label + '"\nField type: ' + field.type +
      (field.options ? "\nAvailable options: " + JSON.stringify(field.options) : "") +
      "\nResume JSON:\n" + JSON.stringify(resumeJson);
  },

  _safeParseJson(text) {
    try { return JSON.parse(text); } catch (e) {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) { try { return JSON.parse(match[0]); } catch (e2) { return null; } }
      return null;
    }
  },

  _mockStructureResume(rawText) {
    const emailMatch = rawText.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    const phoneMatch = rawText.match(/(\+?\d[\d\s().-]{7,}\d)/);
    const linkedinMatch = rawText.match(/linkedin\.com\/in\/[\w-]+/i);
    const githubMatch = rawText.match(/github\.com\/[\w-]+/i);
    const lines = rawText.split("\n").map(function (l) { return l.trim(); }).filter(Boolean);
    return {
      name: lines[0] || "",
      email: emailMatch ? emailMatch[0] : "",
      phone: phoneMatch ? phoneMatch[0] : "",
      location: "",
      linkedin: linkedinMatch ? ("https://" + linkedinMatch[0]) : "",
      github: githubMatch ? ("https://" + githubMatch[0]) : "",
      summary: lines.slice(1, 3).join(" "),
      experience: [], education: [], skills: [], certifications: [],
      _mock: true
    };
  },

  _mockMapField(field, resumeJson) {
    if (typeof WDMapper !== "undefined" && WDMapper.heuristicMatch) {
      return WDMapper.heuristicMatch(field, resumeJson);
    }
    return { value: "", confidence: 0, source: "mock-no-heuristic" };
  }
};

if (typeof window !== "undefined") window.WDAiClient = WDAiClient;
if (typeof self !== "undefined") self.WDAiClient = WDAiClient;
