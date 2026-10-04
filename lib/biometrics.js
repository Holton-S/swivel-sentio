/**
 * biometrics.js - Simulated stress telemetry for the demo.
 * Stand-in for a real sensor (a wearable or the Presage SDK, a planned addition). The live
 * camera expression check-in in the browser raises this stress signal when the person looks worried.
 */

class BiometricStreamEngine {
  constructor() {
    this.currentMode = "calm"; // 'calm' | 'elevated' | 'panic'
    this.baseHeartRate = 72;
    this.baseStress = 18;
    this.baseBreathing = 15;
    this.history = [];
    this.maxHistory = 60;
  }

  setMode(mode) {
    // "agitated" retained as a backward-compatible alias for "elevated".
    if (mode === "agitated") mode = "elevated";
    if (["calm", "elevated", "panic"].includes(mode)) {
      this.currentMode = mode;
    }
  }

  generateSample() {
    const jitter = () => (Math.random() - 0.5) * 4;
    let hr, stress, rr, microTension, hrv;
    if (this.currentMode === "calm") {
      hr = Math.round(this.baseHeartRate + jitter());
      stress = Math.round(this.baseStress + Math.random() * 8);
      rr = Math.round(this.baseBreathing + jitter() * 0.5);
      microTension = +(0.1 + Math.random() * 0.1).toFixed(2);
      hrv = Math.round(55 + jitter() * 2);
    } else if (this.currentMode === "elevated") {
      hr = Math.round(92 + jitter() * 1.5);
      stress = Math.round(58 + Math.random() * 15);
      rr = Math.round(21 + jitter() * 0.8);
      microTension = +(0.55 + Math.random() * 0.2).toFixed(2);
      hrv = Math.round(32 + jitter());
    } else {
      // Panic / Active Coercion
      hr = Math.round(118 + jitter() * 2.5);
      stress = Math.round(88 + Math.random() * 10);
      rr = Math.round(28 + jitter() * 1.2);
      microTension = +(0.88 + Math.random() * 0.1).toFixed(2);
      hrv = Math.round(18 + jitter() * 0.8);
    }

    const sample = {
      timestamp: Date.now(),
      heartRate: Math.max(50, Math.min(160, hr)),
      stressIndex: Math.max(0, Math.min(100, stress)),
      respiratoryRate: Math.max(10, Math.min(40, rr)),
      hrv: Math.max(10, Math.min(100, hrv)),
      microTension,
      sensorQuality: 98,
      provider: "simulated"
    };

    this.history.push(sample);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    return sample;
  }

  getHistory() {
    return this.history;
  }
}

export const biometricEngine = new BiometricStreamEngine();
