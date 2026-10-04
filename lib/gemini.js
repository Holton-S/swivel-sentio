/**
 * gemini.js - Google Gemini scam analysis for calls and text messages.
 *
 * Returns { score, scamType, reason, flags } or null. null means "use the offline keyword
 * detector only": no key, over the per-run cap, refused, or slow. The app never depends on it.
 *
 * Cost safety: results are cached by message text, identical requests in flight share one call,
 * calls are never retried, are hard-capped per server run, and stop entirely after an
 * auth/quota refusal. Only a user action (scenario, Check, or a finished mic phrase) calls this.
 */
import crypto from "node:crypto";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const MAX_CALLS_PER_RUN = Number(process.env.GEMINI_MAX_CALLS) || 100;
const cache = new Map();
const inFlight = new Map();
let callsThisRun = 0;
let disabledReason = null;

const CATEGORY = { type: "ARRAY", items: { type: "STRING" } };
const SCHEMA = {
  type: "OBJECT",
  properties: {
    score: { type: "INTEGER" },
    scamType: { type: "STRING" },
    reason: { type: "STRING" },
    flags: {
      type: "OBJECT",
      properties: { authority: CATEGORY, urgency: CATEGORY, secrecy: CATEGORY, paymentRail: CATEGORY, emotionalThreat: CATEGORY }
    }
  },
  required: ["score", "scamType", "reason", "flags"]
};

const INSTRUCTIONS = `You protect older adults from payment scams (fake government calls, grandparent emergencies, tech-support, romance, phishing texts, fake delivery or toll fees).
Read the message and judge how likely it is a scam trying to get money or account details.
score: integer 0-100 scam likelihood. 0-20 ordinary and safe. 30-49 some pressure, worth a second look. 50-74 likely scam. 75-100 clear scam.
A real bill or a friendly family note with no pressure scores low. Unknown links, fees to release a package, threats, secrecy, gift cards, wires or crypto score high.
scamType: short label such as "Government impersonation", "Grandparent scam", "Tech support scam", "Delivery fee phishing", "Romance scam", or "None".
reason: one or two calm, plain sentences an older adult would understand. Do not repeat threats like "arrest". Say what to do instead (hang up, call family on a known number, don't click the link).
flags: quote short exact phrases from the message for each category that applies; empty arrays otherwise.`;

export function geminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY) && !disabledReason;
}

export async function analyzeWithGemini(text, channel = "call") {
  const key = process.env.GEMINI_API_KEY;
  if (!key || !text || disabledReason) return null;
  const message = String(text).slice(0, 4000);
  const id = crypto.createHash("sha1").update(`${MODEL}|${channel}|${message}`).digest("hex");
  if (cache.has(id)) return cache.get(id);
  if (inFlight.has(id)) return inFlight.get(id);
  if (callsThisRun >= MAX_CALLS_PER_RUN) {
    console.warn(`[gemini] cap of ${MAX_CALLS_PER_RUN} calls reached this run; using keyword detector`);
    return null;
  }
  callsThisRun++;
  const job = (async () => {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: INSTRUCTIONS }] },
          contents: [{ role: "user", parts: [{ text: `Channel: ${channel === "text" ? "text message" : "phone call transcript"}\nMessage: ${message}` }] }],
          generationConfig: {
            responseMimeType: "application/json", responseSchema: SCHEMA,
            temperature: 0.2, maxOutputTokens: 500, thinkingConfig: { thinkingBudget: 0 }
          }
        }),
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) {
        if ([401, 403, 429].includes(res.status)) disabledReason = `HTTP ${res.status}`;
        console.warn(`[gemini] returned ${res.status}${disabledReason ? " (disabled for this run)" : ""}; using keyword detector`);
        return null;
      }
      const data = await res.json();
      const parsed = JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text || "null");
      if (!parsed || !Number.isFinite(parsed.score)) return null;
      const flags = {};
      for (const k of ["authority", "urgency", "secrecy", "paymentRail", "emotionalThreat"]) {
        flags[k] = Array.isArray(parsed.flags?.[k]) ? parsed.flags[k].filter(f => typeof f === "string").slice(0, 5) : [];
      }
      const result = {
        score: Math.max(0, Math.min(100, Math.round(parsed.score))),
        scamType: String(parsed.scamType || "Unknown").slice(0, 60),
        reason: String(parsed.reason || "").slice(0, 400),
        flags,
        model: MODEL
      };
      cache.set(id, result);
      console.log(`[gemini] ${channel} analyzed: ${result.score}/100 ${result.scamType} (call ${callsThisRun}/${MAX_CALLS_PER_RUN})`);
      return result;
    } catch (err) {
      console.warn(`[gemini] unavailable (${err.message}); using keyword detector`);
      return null;
    } finally {
      inFlight.delete(id);
    }
  })();
  inFlight.set(id, job);
  return job;
}
