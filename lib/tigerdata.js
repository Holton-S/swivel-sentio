/**
 * tigerdata.js - Tiger Data (Timescale/PostgreSQL) Time-Series & Continuous Aggregates Engine
 * Manages high-throughput biometric metric streams and continuous rollup aggregates.
 */

// PostgreSQL Schema DDL definition for Tiger Data submission
export const TIGER_DATA_SCHEMA_DDL = `
-- Tiger Data Timeseries Hypertable for Real-time Biometrics
CREATE TABLE IF NOT EXISTS biometric_telemetry (
    time TIMESTAMPTZ NOT NULL,
    user_id UUID NOT NULL,
    heart_rate INT NOT NULL,
    stress_index INT NOT NULL,
    respiratory_rate INT NOT NULL,
    micro_tension NUMERIC(3,2) NOT NULL,
    session_id VARCHAR(64) NOT NULL
);

SELECT create_hypertable('biometric_telemetry', 'time', if_not_exists => TRUE);

-- Continuous Aggregate for Lag-Free Dashboard Charts
CREATE MATERIALIZED VIEW IF NOT EXISTS biometric_10s_summary
WITH (timescaledb.continuous) AS
SELECT time_bucket('10 seconds', time) AS bucket,
       AVG(heart_rate) AS avg_hr,
       MAX(stress_index) AS peak_stress,
       AVG(respiratory_rate) AS avg_rr
FROM biometric_telemetry
GROUP BY bucket;

-- Swivel Fraud & Coercion Incidents Table
CREATE TABLE IF NOT EXISTS fraud_incidents (
    incident_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    detected_at TIMESTAMPTZ DEFAULT NOW(),
    risk_score INT NOT NULL,
    risk_tier VARCHAR(16) NOT NULL,
    attempted_amount NUMERIC(10,2) NOT NULL,
    payment_rail VARCHAR(32) NOT NULL,
    recipient_alias VARCHAR(128) NOT NULL,
    coercion_flags JSONB NOT NULL,
    intervened_by VARCHAR(64) DEFAULT 'Swivel-Sentio-Shield',
    status VARCHAR(32) DEFAULT 'INTERCEPTED'
);
`;

class TigerDataStore {
  constructor() {
    this.telemetryRecords = [];
    this.incidents = [];
  }

  insertTelemetry(sample, userId = "usr_elderly_842") {
    const record = {
      id: this.telemetryRecords.length + 1,
      time: new Date(sample.timestamp).toISOString(),
      user_id: userId,
      heart_rate: sample.heartRate,
      stress_index: sample.stressIndex,
      respiratory_rate: sample.respiratoryRate,
      micro_tension: sample.microTension,
      session_id: "sess_rh26_active"
    };
    this.telemetryRecords.push(record);
    if (this.telemetryRecords.length > 500) this.telemetryRecords.shift();
    return record;
  }

  recordIncident(data) {
    const incident = {
      incident_id: "inc_" + Math.random().toString(36).substring(2, 9),
      detected_at: new Date().toISOString(),
      risk_score: data.score,
      risk_tier: data.riskTier,
      amount: data.amount || 2500.00,
      attempted_amount: data.amount || 2500.00,
      payment_rail: data.paymentRail || "WIRE_TRANSFER",
      recipient_alias: data.recipient || "Federal Tax Processing Agent",
      coercion_flags: data.flags || {},
      intervened_by: "Swivel-Sentio-Shield",
      status: "INTERCEPTED_SAFETY_PAUSE"
    };
    this.incidents.unshift(incident);
    return incident;
  }

  getRecentIncidents(limit = 10) {
    return this.incidents.slice(0, limit);
  }

  getIncidents(limit = 50) {
    return this.incidents.slice(0, limit);
  }

  getTelemetryRollup() {
    // Continuous Aggregate rollup for frontend graph & charts
    return this.telemetryRecords.slice(-30).map(rec => ({
      ...rec,
      sample_count: 1,
      avg_hr: rec.heart_rate,
      peak_stress: rec.stress_index
    }));
  }
}

export const tigerData = new TigerDataStore();
