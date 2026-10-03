/**
 * notify.js - Optional real-device push notifications via ntfy.sh
 *
 * Free, no account required. To enable, set an environment variable before
 * starting the server:
 *
 *   NTFY_TOPIC       a hard-to-guess topic name you also subscribe to on your
 *                    phone with the ntfy app (iOS/Android) or ntfy.sh/<topic>.
 *   NTFY_SERVER      (optional) self-hosted ntfy base URL. Default: https://ntfy.sh
 *   PUBLIC_BASE_URL  (optional) a publicly reachable URL for THIS server
 *                    (e.g. a Tailscale Funnel / Serve or ngrok URL). When set,
 *                    the phone notification gains tappable Veto / Approve
 *                    buttons that call /api/caregiver/decision directly.
 *
 * When NTFY_TOPIC is unset this module is a no-op, so tests and local demos
 * run unchanged.
 */

const NTFY_SERVER = process.env.NTFY_SERVER || "https://ntfy.sh";

export function pushConfigured() {
  return Boolean(process.env.NTFY_TOPIC);
}

function usd(n) {
  return "$" + Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/**
 * Fire a push for a caregiver escalation. Never throws — returns a small status
 * object so the caller can log without affecting the HTTP response.
 */
export async function pushEscalation(escalation = {}) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return { skipped: true, reason: "NTFY_TOPIC not set" };

  const hr = escalation.vitalSigns && escalation.vitalSigns.heartRate;
  const payload = {
    topic,
    title: "Swivel Shield — verification needed",
    message:
      `URGENT: ${usd(escalation.amount)} transfer to "${escalation.recipient || "Unknown"}" ` +
      `detected under coercion pressure.` +
      (hr ? ` Pulse spiked to ${hr} BPM.` : "") +
      ` Coercion score ${escalation.riskScore ?? "?"}/100.`,
    priority: 5,
    tags: ["rotating_light", "shield"]
  };

  const base = process.env.PUBLIC_BASE_URL;
  if (base && escalation.authId) {
    const url = base.replace(/\/$/, "") + "/api/caregiver/decision";
    payload.actions = [
      {
        action: "http", label: "🚫 Veto & block", url, method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authId: escalation.authId, decision: "VETO" }), clear: true
      },
      {
        action: "http", label: "✅ Approve", url, method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authId: escalation.authId, decision: "APPROVE" }), clear: true
      }
    ];
  }

  try {
    const res = await fetch(NTFY_SERVER, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    return { sent: res.ok, status: res.status };
  } catch (err) {
    return { sent: false, error: err.message };
  }
}
