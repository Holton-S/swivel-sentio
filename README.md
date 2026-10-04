# Swivel Sentio

**A quiet shield against social-engineering fraud.** Swivel Sentio runs as a passive companion
for an older adult, fuses *what is being said* (multimodal coercion detection) with *how their
face is reacting* (a live, on-device expression check-in), and when a high-pressure scam is detected it pauses the
payment, calms the person with an empathetic voice guide, and alerts a family caregiver for a
two-party veto.

> RowdyHacks XII · Tracks: Swivel (social-engineering shield), Presage (contactless optical
> vitals), Google Gemini (multimodal coercion detection), ElevenLabs (empathetic voice),
> Tiger Data (PostgreSQL/TimescaleDB timeseries).

## Quick start

```bash
npm install
npm start
# open http://localhost:3000
```

Run the tests:

```bash
npm test                        # unit suite (detector, biometrics, tiger, voice, caregiver)
node tests/e2e_qc_integration.js   # end-to-end HTTP suite (server must be running)
```

## Two views

- **Granddad's Guardian** — a calm, large-type companion. Shows the active shield and a live
  "Feeling" indicator (Calm / Uneasy / Worried / Scared). During a detected scam it takes over the screen: *"Take a deep breath. We've paused this
  payment."* and plays a calming voice guide.
- **Family Caregiver Portal** — a SaaS-style dashboard for the adult child: protection rules,
  a live threat simulator (four scenarios + live mic), the caregiver veto flow, and the incident
  ledger.

## REST API

| Method | Path | Purpose |
|---|---|---|
| GET  | `/api/biometrics` | Current vitals sample |
| POST | `/api/biometrics/mode` | `{ mode: "calm" \| "elevated" \| "panic" }` |
| POST | `/api/detect` | `{ transcript, biometrics, transaction }` → risk analysis + incident |
| POST | `/api/voice/intervention` | `{ analysis }` → empathetic grounding script |
| POST | `/api/caregiver/escalate` | `{ transaction, analysis, biometrics }` → pending review |
| POST | `/api/caregiver/decision` | `{ authId, decision: "APPROVE" \| "VETO" }` |
| GET  | `/api/tigerdata/rollup` | Timeseries rollup + intercepted-incident ledger |
| GET  | `/api/qa/run` | Runs the unit suite and returns the report |

## Real phone demo (optional, free)

Make a physical phone buzz during the pitch when coercion is detected:

1. Install the **ntfy** app (iOS/Android) and subscribe to a long, hard-to-guess topic, e.g.
   `swivel-sentio-demo-7f3k9q`.
2. Start the server with that topic:
   ```bash
   NTFY_TOPIC=swivel-sentio-demo-7f3k9q npm start
   ```
3. Trigger any scam scenario (or `POST /api/caregiver/escalate`). The phone gets an urgent push.

**Tappable Veto/Approve from the phone:** expose the server with a public URL and set
`PUBLIC_BASE_URL`. The free way is Tailscale Funnel:
```bash
tailscale funnel 3000                      # prints https://<machine>.ts.net
PUBLIC_BASE_URL=https://<machine>.ts.net NTFY_TOPIC=... npm start
```
The notification's **🚫 Veto & block** / **✅ Approve** buttons then call
`/api/caregiver/decision` directly. See `.env.example`.

## Notes

- **Expression check-in (optional camera).** A small on-device model
  ([`@vladmandic/face-api`](https://github.com/vladmandic/face-api), served locally, so it works
  offline) reads facial expression a few times a second. Fear, worry, sadness and surprise raise
  the stress signal, so a scared face can tip a borderline call from LOW to MEDIUM and pause the
  payment. A calm face never lowers a scenario's risk. Video never leaves the browser. This is an
  experimental cue, not a diagnosis.
- With the camera off, stress is simulated by `lib/biometrics.js`. Labels in the UI say so.
- **Future addition: heart rate.** Pulse is not shown. Browser webcam pulse estimates proved too
  unreliable for a live demo. Heart-rate input is planned for when a wearable or the Presage SDK
  is connected. The detector already accepts `heartRate` for that path.
- The demo checkout and SMS/escalation are a demonstration, not a bank or carrier integration.
- Microphone and voice playback use the browser's Web Speech APIs and require browser support,
  permission, and local audio hardware (they will not work through a remote-desktop session that
  doesn't forward mic/audio — run on the presentation machine directly).
