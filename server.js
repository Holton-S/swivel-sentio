import "./lib/env.js";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { analyzeTranscript } from "./lib/detector.js";
import { biometricEngine } from "./lib/biometrics.js";
import { tigerData, TIGER_DATA_SCHEMA_DDL } from "./lib/tigerdata.js";
import { generateInterventionScript, synthesizeSpeech, synthesizeScamCall } from "./lib/voice.js";
import { analyzeWithGemini, transcribeWithGemini } from "./lib/gemini.js";
import { caregiverNetwork } from "./lib/caregiver.js";
import { pushEscalation, pushConfigured } from "./lib/notify.js";
import { runAllTests } from "./tests/qa_qc_runner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
// Larger limit so a few seconds of microphone audio fit in one JSON request.
app.use(express.json({ limit: "4mb" }));
// no-cache: browsers always re-check, so a demo never runs yesterday's code after an update.
app.use(express.static(path.join(__dirname, "public"), { setHeaders: res => res.set("Cache-Control", "no-cache") }));
// Face-expression model is served locally so the demo works offline and video never leaves the device.
app.use("/vendor/face-api", express.static(path.join(__dirname, "node_modules/@vladmandic/face-api/dist")));
app.use("/vendor/face-models", express.static(path.join(__dirname, "node_modules/@vladmandic/face-api/model")));

// --- 1. SIMULATED STRESS TELEMETRY (stand-in for a future wearable / Presage SDK) ---
app.get("/api/biometrics", (req, res) => {
  const sample = biometricEngine.generateSample();
  // When the camera check-in is live, the browser reports what it sees; store that reading instead.
  const camStress = Number(req.query.stress);
  const fromCamera = req.query.source === "camera" && Number.isFinite(camStress) && camStress >= 0 && camStress <= 100;
  tigerData.insertTelemetry(fromCamera
    ? { timestamp: sample.timestamp, stressIndex: Math.round(camStress), expression: String(req.query.expression || "").slice(0, 20) || null, expressionSource: "camera" }
    : sample);
  res.json({ success: true, telemetry: sample });
});

app.post("/api/biometrics/mode", (req, res) => {
  const { mode } = req.body;
  if (!["calm", "elevated", "panic"].includes(mode)) {
    return res.status(400).json({ error: "Invalid mode. Use calm, elevated, or panic." });
  }
  biometricEngine.setMode(mode);
  res.json({ success: true, mode });
});

// --- 2. COERCION DETECTION: Google Gemini + offline keyword rules ---
app.post("/api/detect", async (req, res) => {
  const { transcript, biometrics, transaction, channel } = req.body;
  if (!transcript || typeof transcript !== "string") {
    return res.status(400).json({ error: "Transcript string required." });
  }

  const bioSample = biometrics || biometricEngine.generateSample();
  const aiResult = await analyzeWithGemini(transcript, channel === "text" ? "text" : "call");
  const t0 = performance.now();
  const analysis = analyzeTranscript(transcript, bioSample, aiResult);
  analysis.channel = channel === "text" ? "text" : "call";
  tigerData.recordCheck({ channel: analysis.channel, amount: transaction?.amount, recipient: transaction?.recipient, analysis, biometrics: bioSample });
  const latencyMs = +(performance.now() - t0).toFixed(3);

  // If high or critical risk, record incident in Tiger Data audit log
  let incident = null;
  if (analysis.riskTier === "HIGH" || analysis.riskTier === "CRITICAL") {
    // Derive the payment rail from the detector's own flags so the ledger
    // reflects the real attack vector rather than a hardcoded default.
    const railHit = (analysis.flags?.paymentRail || [])[0] || "";
    let paymentRail = "UNSPECIFIED";
    if (/gift|target|apple|google play/i.test(railHit)) paymentRail = "GIFT_CARD";
    else if (/wire|western union|moneygram/i.test(railHit)) paymentRail = "WIRE_TRANSFER";
    else if (/bitcoin|crypto|ethereum|coinstar/i.test(railHit)) paymentRail = "CRYPTO";
    else if (/zelle|venmo|cashapp|paypal/i.test(railHit)) paymentRail = "P2P_APP";
    else if (/cash|courier|envelope/i.test(railHit)) paymentRail = "CASH_COURIER";
    else if (/https?:|www\.|\.(com|net|info|top|xyz|online|site)\b|fee|balance/i.test(railHit)) paymentRail = "LINK_IN_TEXT";

    incident = tigerData.recordIncident({
      score: analysis.score,
      riskTier: analysis.riskTier,
      amount: transaction?.amount || 0,
      recipient: transaction?.recipient || "Unknown",
      paymentRail,
      flags: analysis.flags,
      scamType: analysis.scamType,
      evaluator: analysis.evaluator
    });
  }

  res.json({
    success: true,
    analysis,
    incident,
    latencyMs
  });
});

// Simulated scam call for demos: ElevenLabs audio plus word timings for live captions.
// 204 means ElevenLabs isn't configured; the page then plays captions without audio.
app.get("/api/demo/scam-call", async (req, res) => {
  const call = await synthesizeScamCall();
  if (!call) return res.status(204).end();
  res.set("Cache-Control", "no-store").json({ success: true, ...call });
});

// Live microphone: Gemini transcribes a short audio chunk. 204 means "not configured", so the
// browser falls back to its own speech recognition.
app.post("/api/transcribe", async (req, res) => {
  const { audio, mimeType } = req.body || {};
  if (!audio || typeof audio !== "string") return res.status(400).json({ error: "Base64 audio required." });
  const text = await transcribeWithGemini(audio, mimeType);
  if (text === null) return res.status(204).end();
  res.json({ success: true, text });
});

// --- 3. ELEVENLABS EMPATHETIC VOICE INTERVENTION ---
app.post("/api/voice/intervention", (req, res) => {
  const { analysis } = req.body;
  if (!analysis) {
    return res.status(400).json({ error: "Analysis object required." });
  }
  const script = generateInterventionScript(analysis);
  res.json({ success: true, script, tts: process.env.ELEVENLABS_API_KEY ? "elevenlabs" : "browser" });
});

// Natural voice audio. 204 means "not configured": the browser uses its best local voice instead.
app.post("/api/voice/speak", async (req, res) => {
  const { text } = req.body || {};
  if (!text || typeof text !== "string" || text.length > 1000) {
    return res.status(400).json({ error: "Text (up to 1000 characters) required." });
  }
  const audio = await synthesizeSpeech(text);
  if (!audio) return res.status(204).end();
  res.set("Content-Type", "audio/mpeg").set("Cache-Control", "no-store").send(audio);
});

// --- 4. CAREGIVER DUAL-PARTY CONSENSUS ESCALATION ---
app.post("/api/caregiver/escalate", (req, res) => {
  const { transaction, analysis, biometrics } = req.body;
  const escalation = caregiverNetwork.createEscalation(
    transaction || { amount: 1500, recipient: "Suspect Destination" },
    analysis || { score: 95, riskTier: "CRITICAL", flags: {} },
    biometrics || biometricEngine.generateSample()
  );
  tigerData.saveReview(escalation);

  // Fire an optional real-device push (ntfy). Non-blocking: never delays or
  // breaks the API response, whether or not NTFY_TOPIC is configured.
  pushEscalation(escalation)
    .then((r) => { if (r && r.sent) console.log("[ntfy] escalation push delivered"); })
    .catch(() => {});

  res.json({ success: true, escalation, push: pushConfigured() ? "attempted" : "disabled" });
});

app.post("/api/caregiver/decision", (req, res) => {
  const { authId, decision } = req.body;
  if (!authId || !["APPROVE", "VETO"].includes(decision)) {
    return res.status(400).json({ error: "authId and valid decision (APPROVE or VETO) required." });
  }
  const result = caregiverNetwork.resolveEscalation(authId, decision);
  if (result.success) tigerData.saveReview(caregiverNetwork.getEscalation(authId));
  res.json({ success: true, result });
});

// The caregiver's phone (public/emily.html) polls this: the alert awaiting a decision, plus history.
app.get("/api/caregiver/active", (req, res) => {
  const recent = caregiverNetwork.getRecent(20);
  const pending = recent.find(item => item.status === "PENDING_CAREGIVER_REVIEW") || null;
  res.set("Cache-Control", "no-store").json({ success: true, escalation: pending, history: recent.filter(item => item !== pending) });
});

app.get("/api/caregiver/status/:id", (req, res) => {
  const esc = caregiverNetwork.getEscalation(req.params.id);
  if (!esc) return res.status(404).json({ error: "Escalation not found" });
  res.json({ success: true, escalation: esc });
});

// --- 5. TIGER DATA POSTGRES TIMESERIES & AUDIT ---
app.get("/api/tigerdata/rollup", async (req, res) => {
  const rollup = await tigerData.getStressRollup();
  const incidents = tigerData.getIncidents();
  res.json({
    success: true,
    store: tigerData.mode,
    rollup,
    incidents,
    schemaDdl: TIGER_DATA_SCHEMA_DDL
  });
});

// --- 6. REAL-TIME QA & QC VERIFICATION SUITE ---
app.get("/api/qa/run", (req, res) => {
  try {
    const report = runAllTests();
    res.json({ success: true, report });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`[Swivel Sentio] Production Pipeline & Defense Server running at http://localhost:${PORT}`);
  // Connect to Tiger Cloud in the background; the server is usable (in memory) meanwhile.
  tigerData.connect().then(async (live) => {
    if (live) caregiverNetwork.restore(await tigerData.loadReviews(20));
  });
});
