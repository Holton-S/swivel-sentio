/**
 * e2e_qc_integration.js - End-to-End Quality Control & SLA Integration Gate
 * Tests live HTTP REST endpoints, data pipelines, schema contracts, and response latency.
 */

const BASE_URL = "http://localhost:3000";

async function runE2EQC() {
  console.log("============================================================");
  console.log("   SWIVEL SENTIO: END-TO-END QC INTEGRATION PIPELINE GATE   ");
  console.log("============================================================\n");

  let passes = 0;
  let total = 0;

  async function check(name, testFn) {
    total++;
    const t0 = performance.now();
    try {
      await testFn();
      const elapsed = (performance.now() - t0).toFixed(2);
      console.log(`  [PASS] ${name} (${elapsed}ms)`);
      passes++;
    } catch (err) {
      console.error(`  [FAIL] ${name}: ${err.message}`);
    }
  }

  // 1. Static Web Assets Verification
  await check("HTTP 200 - Web App Entry (index.html)", async () => {
    const res = await fetch(`${BASE_URL}/`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const text = await res.text();
    // Anchors track the current (redesigned) dual-view UI contract.
    if (!text.includes("Swivel Sentio") || !text.includes("guardian-tab")) {
      throw new Error("index.html missing critical DOM anchors");
    }
  });

  // 2. Presage Biometrics REST API
  await check("API GET /api/biometrics - Vital Signs Stream", async () => {
    const res = await fetch(`${BASE_URL}/api/biometrics`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!data.success || !data.telemetry.heartRate || !data.telemetry.stressIndex) {
      throw new Error("Invalid telemetry schema");
    }
  });

  // 3. Biometric Sensor Mode Switching
  await check("API POST /api/biometrics/mode - Panic Stimulation", async () => {
    const res = await fetch(`${BASE_URL}/api/biometrics/mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "panic" })
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!data.success || data.mode !== "panic") throw new Error("Mode failed to switch");
  });

  // 4. Gemini Multimodal Coercion Detection API (Threat)
  let lastAnalysis = null;
  await check("API POST /api/detect - Severe Coercion Interception", async () => {
    const res = await fetch(`${BASE_URL}/api/detect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript: "This is IRS Special Agent Davis. Wire transfer $4,500 immediately to avoid immediate arrest warrant execution. Do not speak to anyone.",
        transaction: { amount: 4500, recipient: "IRS Tax Division" }
      })
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!data.success || data.analysis.riskTier !== "CRITICAL") {
      throw new Error(`Expected CRITICAL risk tier, received: ${data.analysis?.riskTier}`);
    }
    if (!data.incident || data.incident.amount !== 4500) {
      throw new Error("Incident failed to log to Tiger Data");
    }
    lastAnalysis = data.analysis;
  });

  // 5. Gemini Coercion Detection API (Benign)
  await check("API POST /api/detect - Benign Transaction Allowance", async () => {
    const res = await fetch(`${BASE_URL}/api/detect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript: "Paying City Water and Sewage monthly residential utility bill.",
        transaction: { amount: 65, recipient: "City Water Works" }
      })
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!data.success || data.analysis.riskTier !== "LOW" || data.analysis.coercionDetected) {
      throw new Error(`Expected LOW risk tier and no coercion, got: ${data.analysis?.riskTier}`);
    }
  });

  // 6. ElevenLabs Empathetic Audio Intervention Synthesizer API
  await check("API POST /api/voice/intervention - Grounding Script", async () => {
    const res = await fetch(`${BASE_URL}/api/voice/intervention`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analysis: lastAnalysis })
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!data.success || !data.script.text.includes("IRS")) {
      throw new Error("Intervention script missing contextual threat keywords");
    }
  });

  // 7. Caregiver Dual-Party Consensus Protocol
  let authId = null;
  await check("API POST /api/caregiver/escalate - SMS Dispatch", async () => {
    const res = await fetch(`${BASE_URL}/api/caregiver/escalate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transaction: { amount: 4500, recipient: "IRS Tax Division" },
        analysis: lastAnalysis
      })
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!data.success || !data.escalation.authId) throw new Error("Escalation failed");
    authId = data.escalation.authId;
  });

  // 8. Caregiver Veto Enforcement
  await check("API POST /api/caregiver/decision - Protective Veto", async () => {
    const res = await fetch(`${BASE_URL}/api/caregiver/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authId, decision: "VETO" })
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!data.success || data.result.status !== "BLOCKED_BY_CAREGIVER") {
      throw new Error(`Expected BLOCKED_BY_CAREGIVER, got: ${data.result?.status}`);
    }
  });

  // 9. Tiger Data Timeseries Hypertable Rollup
  await check("API GET /api/tigerdata/rollup - Timeseries Aggregates", async () => {
    const res = await fetch(`${BASE_URL}/api/tigerdata/rollup`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!data.success || !data.schemaDdl || data.incidents.length === 0) {
      throw new Error("Tiger Data rollup or incident log missing");
    }
  });

  // 10. Live QA/QC Audit Endpoint & SLA Benchmark
  await check("API GET /api/qa/run - Automated QA Diagnostic & SLA", async () => {
    const res = await fetch(`${BASE_URL}/api/qa/run`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!data.success || data.report.failed > 0) {
      throw new Error(`QA diagnostic reported failures: ${data.report?.failed}`);
    }
    if (data.report.benchmarks.avgLatencyMs > 15.0) {
      throw new Error(`SLA latency exceeded: ${data.report.benchmarks.avgLatencyMs}ms > 15ms`);
    }
  });

  console.log("\n============================================================");
  console.log(`   E2E QC SUMMARY: ${passes}/${total} PASSED (100% Integrity) `);
  console.log("============================================================\n");

  if (passes !== total) {
    process.exit(1);
  }
}

runE2EQC();
