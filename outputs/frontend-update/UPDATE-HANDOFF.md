# Frontend update — completed

Live matched set: public/index.html, public/index.css, public/app.js.
Copies: outputs/frontend-update/ and outputs/swivel-sentio-redesign/.
Pre-update backup: outputs/pre-update-backup/.

## Changes
- Caregiver APPROVE visibly clears the hold and enables the demo checkout. VETO keeps it locked, updates both portal and phone, and records a session receipt. Approved/blocked states survive reload. Missing server authorizations expose retry without unlocking (useful when the in-memory backend restarts).
- Optional Guardian camera: getUserMedia video only, local canvas forehead ROI aligned to the displayed reticle, timestamp resampling, linear detrending, Hann-windowed spectral search (45–180 bpm), autocorrelation and quality gating, and three stable estimates before showing a locked optical signal. Dark, clipped, unstable, flat, or low-quality samples fall back to labeled simulated vitals. Camera tracks stop on off, cancellation, navigation, and backgrounding. No frames are uploaded.
- This is an experimental browser green-channel rPPG estimator, NOT the Presage SDK, face detection, or a clinically validated measurement. Users align their forehead manually. The UI says so. Physical-camera accuracy still needs manual validation; video artifacts can fool any simple periodicity estimator.
- Live non-scenario detection can use a fresh camera pulse estimate with explicitly simulated stress/other vitals. Preset scenarios deliberately use synthetic vitals for reproducibility: IRS/grandchild panic, Geek Squad elevated, utility calm. A selector exposes all three modes.
- Real server ledger is authoritative for amount/recipient, payment rail, risk score, and coercion flags. Session biometric snapshots and caregiver receipts supplement it; they do not overwrite server values.
- Realistic CSS iPhone dispatch simulator with dynamic amount, recipient, snapshot pulse and authorization receipt. Veto uses /api/caregiver/decision. Call Granddad opens a labeled call simulation and does NOT approve, release funds, or place a real call.
- During verification Claude added optional backend push support and restarted the server. Frontend recognizes the response's push=attempted as requested, not delivered. SMS remains labeled simulated. No backend files were edited in this pass.

## Verification
- npm test: 9/9 passed.
- node tests/e2e_qc_integration.js: 10/10 passed.
- Browser on localhost:3000: all four presets, successful approval, phone veto, locked checkout during call, completed utility checkout, approval persistence, actual GIFT_CARD / WIRE_TRANSFER rails and scores, and elevated mode.
- Desktop and 390px mobile portal checked; no horizontal page overflow. Browser console clean during tested flows.
- outputs/test-optical.mjs: 12/12 tests for known pulse frequencies, short/flat/dark/overexposed/noisy signals, illumination fluctuations, and dropped-frame gaps.
- outputs/test-camera-lifecycle.mjs: mocked denial, unsupported API, late permission cancellation, successful start, and track cleanup passed. Browser camera permission cancellation also verified. No physical-camera accuracy or medical validity is claimed.

## Remaining integration work
Actual Presage SDK, durable server records and auth, real financial holds, and telephony are outside this frontend pass. A browser camera cannot supply clinically reliable stress/HRV from this implementation. Optional push delivery is owned by the backend; its success must not be inferred from an attempted response.

## References used
- MDN, video/canvas: https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Manipulating_video_using_canvas
- MDN, getUserMedia camera pipeline: https://developer.mozilla.org/en-US/docs/Web/API/Media_Capture_and_Streams_API/Taking_still_photos
- rPPG methods and limitations: https://arxiv.org/abs/2012.15846
