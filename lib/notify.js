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
 *                    the phone notification gains a one-tap Veto button and a
 *                    Review button. Approving deliberately needs the caregiver
 *                    page and a confirming second tap, never a lock-screen tap.
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

  const mood = escalation.vitalSigns && escalation.vitalSigns.expression;
  const payload = {
    topic,
    title: "Swivel Shield — verification needed",
    message:
      `${usd(escalation.amount)} to "${escalation.recipient || "Unknown"}" ` +
      (escalation.riskTier === "LOW"
        ? `is paused for your OK (a protection rule matched).`
        : `paused: ${escalation.scamType && escalation.scamType !== "None" ? escalation.scamType.toLowerCase() : "pressure tactics"} detected.`) +
      (mood && mood !== "Calm" ? ` Your grandparent looks ${mood.toLowerCase()}.` : "") +
      ` Coercion score ${escalation.riskScore ?? "?"}/100.`,
    priority: 5,
    tags: ["rotating_light", "shield"]
  };

  const base = process.env.PUBLIC_BASE_URL;
  // Tapping the notification opens the caregiver page on the phone.
  if (base) payload.click = base.replace(/\/$/, "") + "/emily.html";
  if (base && escalation.authId) {
    const url = base.replace(/\/$/, "") + "/api/caregiver/decision";
    payload.actions = [
      {
        action: "http", label: "🚫 Veto & block", url, method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authId: escalation.authId, decision: "VETO" }), clear: true
      },
      // No one-tap Approve from a lock screen: releasing money means opening the app and confirming.
      { action: "view", label: "Review", url: base.replace(/\/$/, "") + "/emily.html" }
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
