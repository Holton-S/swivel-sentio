/**
 * voice.js - ElevenLabs Empathetic Audio Intervention Synthesizer
 * Deploys natural, emotionally calming voice audio to de-escalate coerced elderly victims.
 *
 * Scripts are written to be heard by someone who is already frightened: short sentences,
 * reassurance first, and no repeating of the scammer's threats (no agency names, "arrest",
 * "police", "fraud" or "scam"). The on-screen card carries the specifics; the voice just calms.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

// Words a frightened listener should not hear repeated back to them.
export const ALARMING_WORDS = /\b(irs|police|sheriff|fbi|arrest\w*|fraud\w*|scam\w*|threat\w*|warning)\b/i;

const OPENING = "Hi, it's okay. Your money is safe. Nothing has been sent.";
const CLOSING = "There's no rush. Let's take a slow breath together. Emily is on her way to help.";

export function generateInterventionScript(analysis) {
  const { flags = {} } = analysis;

  if (analysis.channel === "text") {
    return {
      title: "Text Message Phishing Warning",
      text: `${OPENING} Real companies and family don't ask for money through a link or a new number in a text, so we've paused it. You don't need to tap anything or reply. ${CLOSING}`,
      voiceTone: "calm_reassuring",
      speakerName: "Sarah (Caregiver Voice)"
    };
  }

  if (flags.authority && flags.authority.some(a => /irs|police|sheriff|fbi/i.test(a))) {
    return {
      title: "Government Impersonation Warning",
      text: `${OPENING} Real government offices never ask for money over the phone like this, so we've paused it for now. You can hang up whenever you're ready. ${CLOSING}`,
      voiceTone: "calm_reassuring",
      speakerName: "Sarah (Caregiver Voice)"
    };
  }

  if (flags.emotionalThreat && flags.emotionalThreat.some(t => /grandson|granddaughter|accident|hospital/i.test(t))) {
    return {
      title: "Family Emergency Verification Alert",
      text: `${OPENING} A call about someone you love can feel very urgent. It's always fine to check first. Let's call them back on the number you already have. ${CLOSING}`,
      voiceTone: "empathic_protective",
      speakerName: "Sarah (Caregiver Voice)"
    };
  }

  if (flags.paymentRail && flags.paymentRail.some(p => /gift card|bitcoin|crypto/i.test(p))) {
    return {
      title: "Unusual Payment Rail Warning",
      text: `${OPENING} Real companies don't ask to be paid with gift cards, so we've paused this for now. You don't need to read out any numbers. ${CLOSING}`,
      voiceTone: "gentle_firm",
      speakerName: "Sarah (Caregiver Voice)"
    };
  }

  // General default safety pause
  return {
    title: "Safety Pause Initiated",
    text: `${OPENING} We've paused this payment just to be safe. ${CLOSING}`,
    voiceTone: "soothing_reassuring",
    speakerName: "Sarah (Caregiver Voice)"
  };
}

/**
 * Synthesizes speech with ElevenLabs when ELEVENLABS_API_KEY is set.
 * Returns an audio/mpeg Buffer, or null when not configured, over budget, or the call fails,
 * so the browser can fall back to its best local voice.
 *
 * Credit safety: every distinct script is synthesized once and cached on disk, so replays cost
 * nothing. Identical requests in flight share one call. Calls are only made from a user's button
 * press (never on a timer), are never retried, and are hard-capped per server run.
 */
const CACHE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".cache", "voice");
const MAX_CALLS_PER_RUN = Number(process.env.ELEVENLABS_MAX_CALLS) || 20;
const inFlight = new Map();
let callsThisRun = 0;
let disabledReason = null; // Set on an account/quota refusal so a misconfiguration never repeats calls.

export async function synthesizeSpeech(text) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key || !text) return null;
  const voiceId = process.env.ELEVENLABS_VOICE_ID || "EXAVITQu4vr4xnSDxMaL"; // "Sarah": mature, reassuring (a premade voice free accounts can use)
  const modelId = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";
  const id = crypto.createHash("sha1").update(`${voiceId}|${modelId}|${text}`).digest("hex");
  const file = path.join(CACHE_DIR, `${id}.mp3`);
  if (fs.existsSync(file)) return fs.readFileSync(file);
  if (inFlight.has(id)) return inFlight.get(id);
  if (disabledReason) return null;
  if (callsThisRun >= MAX_CALLS_PER_RUN) {
    console.warn(`[voice] ElevenLabs cap of ${MAX_CALLS_PER_RUN} calls reached this run; using browser voice`);
    return null;
  }
  callsThisRun++;
  const job = (async () => {
    try {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: { stability: 0.7, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true }
        }),
        signal: AbortSignal.timeout(12000)
      });
      if (!res.ok) {
        if ([401, 402, 403, 429].includes(res.status)) disabledReason = `HTTP ${res.status}`;
        console.warn(`[voice] ElevenLabs returned ${res.status}${disabledReason ? " (disabled for this run)" : ""}; falling back to browser voice`);
        return null;
      }
      const audio = Buffer.from(await res.arrayBuffer());
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      fs.writeFileSync(file, audio);
      console.log(`[voice] ElevenLabs synthesized ${text.length} chars (call ${callsThisRun}/${MAX_CALLS_PER_RUN}); cached for replays`);
      return audio;
    } catch (err) {
      console.warn(`[voice] ElevenLabs unavailable (${err.message}); falling back to browser voice`);
      return null;
    } finally {
      inFlight.delete(id);
    }
  })();
  inFlight.set(id, job);
  return job;
}
