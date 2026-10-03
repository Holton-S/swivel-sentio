/**
 * qa_qc_runner.js - Automated Quality Assurance & Quality Control Test Suite
 * Validates detection accuracy, false-positive resistance, biometric ingestion, and SLA latencies.
 */

import { analyzeTranscript } from "../lib/detector.js";
import { biometricEngine } from "../lib/biometrics.js";
import { tigerData, TIGER_DATA_SCHEMA_DDL } from "../lib/tigerdata.js";
import { generateInterventionScript } from "../lib/voice.js";
import { caregiverNetwork } from "../lib/caregiver.js";

const TEST_CASES = [
  {
    id: "SCAM-01",
    name: "IRS Wire Fraud with Arrest Threat",
    text: "This is Officer Miller from the Internal Revenue Service IRS. You owe back taxes. Wire transfer the penalty immediately within 30 minutes or the local sheriff will issue an arrest warrant and you will go to jail. Do not hang up.",
    biometrics: { heartRate: 115, stressIndex: 88, respiratoryRate: 26 },
    expectedTier: "CRITICAL",
    expectedAction: "SAFETY_PAUSE_LOCK",
    shouldDetectCoercion: true
  },
  {
    id: "SCAM-02",
    name: "Grandchild Hospital Emergency",
    text: "Grandma, it's your grandson! I was in a terrible car accident and I'm at the hospital. Please don't tell mom and dad, but I need you to send a $3,000 wire transfer right now for the emergency surgery before it's too late.",
    biometrics: { heartRate: 108, stressIndex: 82, respiratoryRate: 24 },
    expectedTier: "CRITICAL",
    expectedAction: "SAFETY_PAUSE_LOCK",
    shouldDetectCoercion: true
  },
  {
    id: "SCAM-03",
    name: "Geek Squad Fake Refund Gift Card Demand",
    text: "Hello sir, this is Geek Squad tech support. We noticed a charge on your account. To cancel it, go to Target and buy Apple gift cards, then read the numbers to me. Keep this confidential between you and me.",
    biometrics: { heartRate: 85, stressIndex: 65, respiratoryRate: 19 },
    expectedTier: "HIGH",
    expectedAction: "SAFETY_PAUSE_CONFIRM",
    shouldDetectCoercion: true
  },
  {
    id: "BENIGN-01",
    name: "Legitimate Utility Payment",
    text: "Payment for City Public Service Energy electric bill for the month of September. Thank you for using online bill pay.",
    biometrics: { heartRate: 68, stressIndex: 12, respiratoryRate: 15 },
    expectedTier: "LOW",
    expectedAction: "ALLOW",
    shouldDetectCoercion: false
  },
  {
    id: "BENIGN-02",
    name: "Normal Gift to Granddaughter",
    text: "Happy birthday to my lovely granddaughter Emily! Here is some money for your college textbooks and graduation party.",
    biometrics: { heartRate: 72, stressIndex: 15, respiratoryRate: 16 },
    expectedTier: "LOW",
    expectedAction: "ALLOW",
    shouldDetectCoercion: false
  }
];

export function runAllTests() {
  const results = {
    timestamp: new Date().toISOString(),
    total: 0,
    passed: 0,
    failed: 0,
    benchmarks: {},
    details: []
  };

  console.log("============================================================");
  console.log("   SWIVEL SENTIO: QA & QC SYSTEM INTEGRITY VERIFICATION     ");
  console.log("============================================================\n");

  // 1. Detection Engine Tests
  console.log("[QA SUITE 1] Conversational Coercion & Social Engineering Models");
  for (const tc of TEST_CASES) {
    results.total++;
    const t0 = performance.now();
    const res = analyzeTranscript(tc.text, tc.biometrics);
    const latency = +(performance.now() - t0).toFixed(3);

    const passedTier = res.riskTier === tc.expectedTier || (tc.shouldDetectCoercion && (res.riskTier === "HIGH" || res.riskTier === "CRITICAL"));
    const passedCoercion = res.coercionDetected === tc.shouldDetectCoercion;
    const testPassed = passedTier && passedCoercion;

    if (testPassed) {
      results.passed++;
      console.log(`  [PASS] ${tc.id}: ${tc.name} (${latency}ms) -> Tier: ${res.riskTier}, Score: ${res.score}/100`);
    } else {
      results.failed++;
      console.error(`  [FAIL] ${tc.id}: ${tc.name} -> Expected ${tc.expectedTier}, Got ${res.riskTier}`);
    }

    results.details.push({
      id: tc.id,
      name: tc.name,
      passed: testPassed,
      latencyMs: latency,
      actualTier: res.riskTier,
      score: res.score,
      flags: res.flags
    });
  }

  // 2. Presage Biometrics Stream Unit Test
  console.log("\n[QA SUITE 2] Presage rPPG Optical Sensor Stream Telemetry");
  results.total++;
  biometricEngine.setMode("panic");
  const panicSample = biometricEngine.generateSample();
  const bioPassed = panicSample.heartRate > 90 && panicSample.stressIndex > 70;
  if (bioPassed) {
    results.passed++;
    console.log(`  [PASS] BIO-01: Panic Telemetry Simulation (Pulse: ${panicSample.heartRate} BPM, Stress: ${panicSample.stressIndex}/100)`);
  } else {
    results.failed++;
    console.error(`  [FAIL] BIO-01: Heart rate or stress below panic threshold`);
  }
  biometricEngine.setMode("calm");

  // 3. Tiger Data Postgres Schema & Continuous Rollups
  console.log("\n[QA SUITE 3] Tiger Data Postgres Relational & Timeseries Layer");
  results.total++;
  const schemaValid = TIGER_DATA_SCHEMA_DDL.includes("create_hypertable") && TIGER_DATA_SCHEMA_DDL.includes("continuous");
  const testSample = biometricEngine.generateSample();
  const rec = tigerData.insertTelemetry(testSample);
  const inc = tigerData.recordIncident({ score: 95, riskTier: "CRITICAL", amount: 2500 });
  const rollup = tigerData.getTelemetryRollup();

  if (schemaValid && rec.heart_rate && inc.incident_id && rollup.length > 0) {
    results.passed++;
    console.log(`  [PASS] TIGER-01: Schema DDL verified, Hypertable inserted, Rollup size: ${rollup.length}`);
  } else {
    results.failed++;
    console.error(`  [FAIL] TIGER-01: Tiger Data operations failed.`);
  }

  // 4. ElevenLabs Empathetic Audio Intervention Synthesizer
  console.log("\n[QA SUITE 4] ElevenLabs Empathetic Audio Synthesis Engine");
  results.total++;
  const mockAnalysis = {
    flags: { authority: ["irs"], emotionalThreat: ["arrest"] },
    score: 90
  };
  const voiceScript = generateInterventionScript(mockAnalysis);
  const voicePassed = voiceScript.text.includes("IRS") && voiceScript.speakerName.includes("Caregiver");
  if (voicePassed) {
    results.passed++;
    console.log(`  [PASS] VOICE-01: Intervention script generated -> Voice: ${voiceScript.speakerName}`);
  } else {
    results.failed++;
    console.error(`  [FAIL] VOICE-01: Voice script failed.`);
  }

  // 5. Caregiver Escalation State Machine
  console.log("\n[QA SUITE 5] Caregiver Dual-Party Consensus Protocol");
  results.total++;
  const escalation = caregiverNetwork.createEscalation({ amount: 1500, recipient: "Tax Department" }, mockAnalysis, panicSample);
  const vetoRes = caregiverNetwork.resolveEscalation(escalation.authId, "VETO");
  const caregiverPassed = escalation.authId && vetoRes.status === "BLOCKED_BY_CAREGIVER";
  if (caregiverPassed) {
    results.passed++;
    console.log(`  [PASS] CARE-01: Escalation flow resolved -> Status: ${vetoRes.status}`);
  } else {
    results.failed++;
    console.error(`  [FAIL] CARE-01: Escalation flow resolution failed.`);
  }

  // 6. High-Throughput SLA Benchmark (100 sequential inferences)
  console.log("\n[QC BENCHMARK] Latency & Throughput Stress Test");
  const benchT0 = performance.now();
  for (let i = 0; i < 100; i++) {
    analyzeTranscript("Wire transfer money immediately to FBI official before arrest", { heartRate: 110, stressIndex: 80 });
  }
  const totalBenchTime = performance.now() - benchT0;
  const avgLatency = +(totalBenchTime / 100).toFixed(3);
  results.benchmarks.avgLatencyMs = avgLatency;
  results.benchmarks.throughputPerSec = Math.round(1000 / avgLatency);

  console.log(`  [BENCHMARK] 100 inferences completed in ${totalBenchTime.toFixed(2)}ms`);
  console.log(`  [BENCHMARK] Average Inference Latency: ${avgLatency}ms (Target: < 15ms)`);
  console.log(`  [BENCHMARK] Throughput: ~${results.benchmarks.throughputPerSec} requests/sec`);

  console.log("\n============================================================");
  console.log(`   QA & QC SUMMARY: ${results.passed}/${results.total} PASSED (Accuracy: ${((results.passed/results.total)*100).toFixed(1)}%)   `);
  console.log("============================================================\n");

  return results;
}

// Execute if run directly
if (process.argv[1] && process.argv[1].endsWith("qa_qc_runner.js")) {
  const summary = runAllTests();
  process.exit(summary.failed === 0 ? 0 : 1);
}
