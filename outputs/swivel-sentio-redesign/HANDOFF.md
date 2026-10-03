# Swivel Sentio frontend handoff

Use index.html, index.css, and app.js from this folder together. They are a matched set; copy all three into public/ when merging. The live public/index.html was concurrently replaced by another editor, so the isolated outputs copy is the authoritative deliverable for this redesign. Original files were backed up in outputs/redesign-backup before edits.

Preview: http://127.0.0.1:3100 while the preview process is running. Restart with `node outputs/swivel-sentio-redesign/preview.mjs` from the project root. This local-only preview forwards /api calls to the existing backend on port 3000.

## Included

- Calm Guardian and separate Family Portal; keyboard-accessible tabs, reduced-motion support, responsive layouts, 48px controls, and large intervention text.
- Four simulator presets, API telemetry polling, Web Speech recognition with permission/error/unsupported states, editable transcript fallback, and speech synthesis using the intervention endpoint.
- Demo checkout locked on high/critical/medium risk, enabled safety rules, or exceeded limits. Unknown detection outcomes cannot complete checkout. Pending reviews cannot be reset away. Session locks survive reload.
- Local rule/contact preferences, session audit enrichment with matched signals and biometrics, caregiver veto receipts, backend ledger refresh, and diagnostic endpoint.

## Backend merge gaps

1. POST /api/caregiver/decision validates APPROVE, but lib/caregiver.js only recognizes CONFIRM. Frontend sends the documented APPROVE and checks nested result.success and result.status. Currently approval fails visibly and leaves checkout locked. Support APPROVE in the backend; do not make the frontend pretend approval succeeded.
2. Biometrics are currently simulated by lib/biometrics.js, not a connected camera. Battery telemetry is not supplied. UI labels both honestly; connect real sources before changing those labels.
3. Caregiver escalation currently creates an in-memory record; it does not deliver SMS. The Emily contact setting is local UI configuration, not connected to the backend's Sarah contact. Add an authenticated contact/settings API and SMS transport to activate this.
4. Server incident records omit detected flags and biometric snapshots, and do not persist family decision receipts. This frontend supplements records from sessionStorage. Persist flags, vitals, receipt timestamps, and auth IDs server-side for cross-device history.
5. Checkout is a demo, not a bank integration. Real financial holds, authenticated caregiver access, authorization, and durable transaction state must be enforced on the server.
6. Web Speech microphone requires browser support and permission. It is not access to arbitrary system call audio. Browser speech services may process audio remotely. Speech synthesis uses the browser's available voices.
7. /api/biometrics/mode accepts elevated, but biometricEngine expects agitated. The frontend uses only calm and panic so it does not depend on this mismatch.

## Verification

- JavaScript syntax: passed.
- Existing npm test backend suite: 9/9 passed.
- Browser-tested all four scenarios: three scams intercepted; normal utility payment allowed and demo checkout completed.
- Verified rejected APPROVE keeps checkout disabled; VETO records a confirmed receipt.
- Verified locked transaction survives reload.
- Desktop 1440px and mobile 390px visual checks; no mobile page overflow at 390px.
- No browser console errors during the tested flows.
- Actual microphone permission/transcription and audible speech playback require a manual device check; not claimed as tested.

Screenshots: family-preview.png. Google Fonts has local sans-serif fallbacks if unavailable.
