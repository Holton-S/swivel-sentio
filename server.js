import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { analyzeTranscript } from "./lib/detector.js";
import { biometricEngine } from "./lib/biometrics.js";
import { tigerData, TIGER_DATA_SCHEMA_DDL } from "./lib/tigerdata.js";
import { generateInterventionScript } from "./lib/voice.js";
import { caregiverNetwork } from "./lib/caregiver.js";
import { pushEscalation, pushConfigured } from "./lib/notify.js";
import { runAllTests } from "./tests/qa_qc_runner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --- 1. BIOMETRICS STREAM & SIMULATION ---
app.get("/api/biometrics", (req, res) => {
  const sample = biometricEngine.generateSample();
  tigerData.insertTelemetry(sample);
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

// --- 2. MULTIMODAL COERCION DETECTION ENGINE (Gemini API pipeline) ---
app.post("/api/detect", (req, res) => {
  const { transcript, biometrics, transaction } = req.body;
  if (!transcript || typeof transcript !== "string") {
    return res.status(400).json({ error: "Transcript string required." });
  }

  const bioSample = biometrics || biometricEngine.generateSample();
  const t0 = performance.now();
  const analysis = analyzeTranscript(transcript, bioSample);
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

    incident = tigerData.recordIncident({
      score: analysis.score,
      riskTier: analysis.riskTier,
      amount: transaction?.amount || 0,
      recipient: transaction?.recipient || "Unknown",
      paymentRail,
      flags: analysis.flags
    });
  }

  res.json({
    success: true,
    analysis,
    incident,
    latencyMs
  });
});

// --- 3. ELEVENLABS EMPATHETIC VOICE INTERVENTION ---
app.post("/api/voice/intervention", (req, res) => {
  const { analysis } = req.body;
  if (!analysis) {
    return res.status(400).json({ error: "Analysis object required." });
  }
  const script = generateInterventionScript(analysis);
  res.json({ success: true, script });
});

// --- 4. CAREGIVER DUAL-PARTY CONSENSUS ESCALATION ---
app.post("/api/caregiver/escalate", (req, res) => {
  const { transaction, analysis, biometrics } = req.body;
  const escalation = caregiverNetwork.createEscalation(
    transaction || { amount: 1500, recipient: "Suspect Destination" },
    analysis || { score: 95, riskTier: "CRITICAL", flags: {} },
    biometrics || biometricEngine.generateSample()
  );

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
  res.json({ success: true, result });
});

app.get("/api/caregiver/status/:id", (req, res) => {
  const esc = caregiverNetwork.getEscalation(req.params.id);
  if (!esc) return res.status(404).json({ error: "Escalation not found" });
  res.json({ success: true, escalation: esc });
});

// --- 5. TIGER DATA POSTGRES TIMESERIES & AUDIT ---
app.get("/api/tigerdata/rollup", (req, res) => {
  const rollup = tigerData.getTelemetryRollup();
  const incidents = tigerData.getIncidents();
  res.json({
    success: true,
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
});
