/**
 * tigerdata.js - Tiger Data (TimescaleDB on Tiger Cloud) time-series store.
 *
 * When DATABASE_URL is set, every stress reading and every intercepted scam is written to
 * Tiger Cloud: readings and incidents are hypertables, a continuous aggregate rolls stress up
 * per minute for the family dashboard, and caregiver decisions persist so Emily's history
 * survives a server restart. Without DATABASE_URL (or if the database is unreachable) the same
 * API runs in memory, so the demo and the tests never depend on the network.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

export const TIGER_DATA_SCHEMA_DDL = `
-- Every stress reading: simulated, or raised by the live camera expression check-in.
CREATE TABLE IF NOT EXISTS stress_readings (
    time         TIMESTAMPTZ NOT NULL,
    stress_index INT NOT NULL,
    expression   TEXT,
    source       TEXT NOT NULL
);
SELECT create_hypertable('stress_readings', 'time', if_not_exists => TRUE);

-- Every intercepted scam, with Gemini's verdict and the payment it tried to take.
CREATE TABLE IF NOT EXISTS scam_incidents (
    detected_at  TIMESTAMPTZ NOT NULL,
    incident_id  TEXT NOT NULL,
    risk_score   INT NOT NULL,
    risk_tier    TEXT NOT NULL,
    scam_type    TEXT,
    amount       NUMERIC(12,2) NOT NULL,
    payment_rail TEXT NOT NULL,
    recipient    TEXT NOT NULL,
    flags        JSONB NOT NULL,
    evaluator    TEXT
);
SELECT create_hypertable('scam_incidents', 'detected_at', if_not_exists => TRUE);

-- Every payment request checked, safe or not: the complete audit trail.
CREATE TABLE IF NOT EXISTS payment_checks (
    time         TIMESTAMPTZ NOT NULL,
    channel      TEXT NOT NULL,
    amount       NUMERIC(12,2) NOT NULL,
    recipient    TEXT NOT NULL,
    risk_score   INT NOT NULL,
    risk_tier    TEXT NOT NULL,
    scam_type    TEXT,
    stress_index INT,
    expression   TEXT,
    evaluator    TEXT
);
SELECT create_hypertable('payment_checks', 'time', if_not_exists => TRUE);

-- Caregiver reviews (Emily's phone), so history and decisions survive restarts.
CREATE TABLE IF NOT EXISTS caregiver_reviews (
    auth_id     TEXT PRIMARY KEY,
    created_at  TIMESTAMPTZ NOT NULL,
    resolved_at TIMESTAMPTZ,
    status      TEXT NOT NULL,
    data        JSONB NOT NULL
);

-- Continuous aggregate: per-minute stress for lag-free dashboard charts.
CREATE MATERIALIZED VIEW IF NOT EXISTS stress_per_minute
WITH (timescaledb.continuous) AS
SELECT time_bucket('1 minute', time) AS bucket,
       AVG(stress_index)::INT AS avg_stress,
       MAX(stress_index)      AS peak_stress,
       COUNT(*)               AS readings
FROM stress_readings
GROUP BY bucket
WITH NO DATA;
`;

// Kept separate: Timescale rejects a policy that already exists, so this tolerates re-runs.
const REFRESH_POLICY = `SELECT add_continuous_aggregate_policy('stress_per_minute',
  start_offset => INTERVAL '1 hour', end_offset => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 minute', if_not_exists => TRUE);`;

const CA_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "certs", "timescale-ca.pem");

class TigerDataStore {
  constructor() {
    this.telemetryRecords = [];
    this.incidents = [];
    this.pool = null;
    this.mode = "memory";
    this.lastError = null;
  }

  /** Connects to Tiger Cloud and applies the schema. Resolves to true when the database is live. */
  async connect() {
    const url = process.env.DATABASE_URL;
    if (!url) return false;
    try {
      // Tiger Cloud signs with its own CA (ca.timescale.com); trust exactly that, with full verification.
      const parsed = new URL(url);
      parsed.searchParams.delete("sslmode");
      const ssl = fs.existsSync(CA_PATH) ? { ca: fs.readFileSync(CA_PATH, "utf8"), rejectUnauthorized: true } : { rejectUnauthorized: true };
      this.pool = new pg.Pool({ connectionString: parsed.toString(), ssl, max: 4, idleTimeoutMillis: 30000, connectionTimeoutMillis: 8000 });
      this.pool.on("error", err => this.fail(err));
      await this.pool.query(TIGER_DATA_SCHEMA_DDL);
      await this.pool.query(REFRESH_POLICY).catch(() => {});
      // Real-time aggregate: include the newest, not-yet-materialized minute in dashboard reads.
      await this.pool.query("ALTER MATERIALIZED VIEW stress_per_minute SET (timescaledb.materialized_only = false)").catch(() => {});
      this.mode = "tiger-cloud";
      const { rows } = await this.pool.query(`SELECT detected_at, incident_id, risk_score, risk_tier, scam_type, amount, payment_rail, recipient, flags
        FROM scam_incidents ORDER BY detected_at DESC LIMIT 50`);
      this.incidents = rows.map(r => this.toIncident({ ...r, amount: Number(r.amount) }));
      console.log(`[tigerdata] connected to Tiger Cloud; ${rows.length} past incidents loaded`);
      return true;
    } catch (err) {
      this.fail(err);
      return false;
    }
  }

  fail(err) {
    if (this.lastError !== err.message) console.warn(`[tigerdata] database unavailable (${err.message}); using in-memory store`);
    this.lastError = err.message;
  }

  // Writes are fire-and-forget: the shield never waits on, or breaks because of, the database.
  write(sql, values) {
    if (!this.pool || this.mode !== "tiger-cloud") return;
    this.pool.query(sql, values).catch(err => this.fail(err));
  }

  insertTelemetry(sample) {
    const record = {
      time: new Date(sample.timestamp || Date.now()).toISOString(),
      stress_index: sample.stressIndex,
      expression: sample.expression || null,
      source: sample.expressionSource === "camera" ? "camera" : "simulated"
    };
    this.telemetryRecords.push(record);
    if (this.telemetryRecords.length > 500) this.telemetryRecords.shift();
    this.write("INSERT INTO stress_readings (time, stress_index, expression, source) VALUES ($1, $2, $3, $4)",
      [record.time, record.stress_index, record.expression, record.source]);
    return record;
  }

  toIncident(r) {
    return {
      incident_id: r.incident_id,
      detected_at: new Date(r.detected_at).toISOString(),
      risk_score: r.risk_score,
      risk_tier: r.risk_tier,
      scam_type: r.scam_type || null,
      amount: r.amount,
      attempted_amount: r.amount,
      payment_rail: r.payment_rail,
      recipient_alias: r.recipient,
      coercion_flags: r.flags || {},
      intervened_by: "Swivel-Sentio-Shield",
      status: "INTERCEPTED_SAFETY_PAUSE"
    };
  }

  recordIncident(data) {
    const incident = this.toIncident({
      incident_id: "inc_" + Math.random().toString(36).substring(2, 9),
      detected_at: new Date(),
      risk_score: data.score,
      risk_tier: data.riskTier,
      scam_type: data.scamType,
      amount: data.amount || 0,
      payment_rail: data.paymentRail || "UNSPECIFIED",
      recipient: data.recipient || "Unknown",
      flags: data.flags || {}
    });
    this.incidents.unshift(incident);
    if (this.incidents.length > 200) this.incidents.pop();
    this.write(`INSERT INTO scam_incidents (detected_at, incident_id, risk_score, risk_tier, scam_type, amount, payment_rail, recipient, flags, evaluator)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [incident.detected_at, incident.incident_id, incident.risk_score, incident.risk_tier, incident.scam_type,
       incident.amount, incident.payment_rail, incident.recipient_alias, JSON.stringify(incident.coercion_flags), data.evaluator || null]);
    return incident;
  }

  /** Logs every checked payment request, including safe ones, for a complete audit trail. */
  recordCheck({ channel, amount, recipient, analysis, biometrics }) {
    this.write(`INSERT INTO payment_checks (time, channel, amount, recipient, risk_score, risk_tier, scam_type, stress_index, expression, evaluator)
      VALUES (NOW(), $1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [channel === "text" ? "text" : "call", Number(amount) || 0, String(recipient || "Unknown").slice(0, 200), analysis.score, analysis.riskTier,
       analysis.scamType || null, Number.isFinite(biometrics?.stressIndex) ? Math.round(biometrics.stressIndex) : null,
       biometrics?.expression ? String(biometrics.expression).slice(0, 20) : null, analysis.evaluator || null]);
  }

  /** Upserts a caregiver review whenever it is created or decided. */
  saveReview(escalation) {
    if (!escalation?.authId) return;
    this.write(`INSERT INTO caregiver_reviews (auth_id, created_at, resolved_at, status, data) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (auth_id) DO UPDATE SET resolved_at = EXCLUDED.resolved_at, status = EXCLUDED.status, data = EXCLUDED.data`,
      [escalation.authId, escalation.createdAt, escalation.resolvedAt || null, escalation.status, JSON.stringify(escalation)]);
  }

  /** Recent caregiver reviews, oldest first, to restore Emily's history after a restart. */
  async loadReviews(limit = 20) {
    if (this.mode !== "tiger-cloud") return [];
    try {
      const { rows } = await this.pool.query("SELECT data FROM caregiver_reviews ORDER BY created_at DESC LIMIT $1", [limit]);
      return rows.map(r => r.data).reverse();
    } catch (err) { this.fail(err); return []; }
  }

  getRecentIncidents(limit = 10) {
    return this.incidents.slice(0, limit);
  }

  getIncidents(limit = 50) {
    return this.incidents.slice(0, limit);
  }

  /** In-memory rollup (used by tests and when offline). */
  getTelemetryRollup() {
    return this.telemetryRecords.slice(-30).map(rec => ({ ...rec, readings: 1, avg_stress: rec.stress_index, peak_stress: rec.stress_index }));
  }

  /** Per-minute stress from the continuous aggregate (real-time mode includes the newest minute). */
  async getStressRollup() {
    if (this.mode !== "tiger-cloud") return this.getTelemetryRollup();
    try {
      const { rows } = await this.pool.query(`SELECT bucket, avg_stress, peak_stress, readings FROM stress_per_minute
        WHERE bucket > NOW() - INTERVAL '30 minutes' ORDER BY bucket`);
      return rows.map(r => ({ bucket: new Date(r.bucket).toISOString(), avg_stress: r.avg_stress, peak_stress: r.peak_stress, readings: Number(r.readings) }));
    } catch (err) { this.fail(err); return this.getTelemetryRollup(); }
  }
}

export { TigerDataStore };
export const tigerData = new TigerDataStore();
