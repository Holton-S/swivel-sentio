/* Swivel Sentio — dependency-free companion and family portal.
 * Payment controls are a demo. Enforce real financial holds on a trusted server.
 */
'use strict';
const $ = id => document.getElementById(id);
const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
const state = { bio: null, connected: false, busy: false, listening: false, recognition: null, transaction: null, analysis: null, locked: false, completed: false, authId: null, receipt: null, incidentId: null, script: '', entries: [], serverEntries: [], timer: null, speech: null };
const presets = {
  irs: { amount: 2400, recipient: 'Federal Tax Processing', rail: 'wire', mode: 'panic', transcript: 'This is the IRS. You must wire transfer the penalty immediately or police will arrest you. Do not hang up. Keep this confidential.' },
  grandchild: { amount: 3000, recipient: 'Emergency Hospital Transfer', rail: 'wire', mode: 'panic', transcript: "Granddad, your grandson is in the hospital after an accident. Please wire money right now for emergency surgery. Do not tell your family. Hurry before it is too late." },
  geek: { amount: 1200, recipient: 'Geek Squad Support', rail: 'gift', mode: 'elevated', transcript: 'This is Geek Squad tech support. Buy Apple gift cards immediately to fix your frozen account. Read the numbers to me and keep this confidential. Do not hang up.' },
  utility: { amount: 85, recipient: 'City Electric', rail: 'bill', mode: 'calm', transcript: 'Your monthly electric bill is 85 dollars. Review your statement and pay through your usual online account by the end of the month. Thank you.' }
};
let noticeTimer, micTimer, auditBusy = false;
function notice(message) { $('notice').textContent = message; $('notice').hidden = false; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { $('notice').hidden = true; }, 7000); }
async function api(path, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`Service returned ${response.status}`);
    const data = await response.json();
    if (data.success === false) throw new Error(data.error || 'Service could not complete this request');
    return data;
  } catch (error) { throw new Error(error.name === 'AbortError' ? 'Service timed out. Please try again.' : error.message); }
  finally { clearTimeout(timeout); }
}
function view(name, focus = false) {
  for (const item of ['guardian', 'family']) {
    const active = item === name;
    $(item).hidden = !active;
    $(`${item}-tab`).setAttribute('aria-selected', String(active));
    $(`${item}-tab`).tabIndex = active ? 0 : -1;
  }
  if (focus) $(name === 'guardian' && state.locked ? 'intervention' : `${name}-tab`).focus();
}
for (const name of ['guardian', 'family']) {
  $(`${name}-tab`).addEventListener('click', () => view(name));
  $(`${name}-tab`).addEventListener('keydown', event => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); view(event.key === 'Home' ? 'guardian' : event.key === 'End' ? 'family' : name === 'guardian' ? 'family' : 'guardian', true);
    }
  });
}
document.querySelector('.brand').addEventListener('click', event => { event.preventDefault(); view('guardian', true); });
function saveSession() {
  try { sessionStorage.setItem('sentio-session-v2', JSON.stringify({ transaction: state.transaction, analysis: state.analysis, locked: state.locked, completed: state.completed, authId: state.authId, receipt: state.receipt, incidentId: state.incidentId, entries: state.entries.slice(0, 50), script: state.script, demoScenario: state.demoScenario, dispatch: state.dispatch, incidentBio: state.incidentBio, selectedMode: state.selectedMode })); }
  catch { notice('This browser cannot save session history. Keep this tab open during the demo.'); }
}
function settings() { return { wire: $('wire-lock').checked, gift: $('gift-lock').checked, limit: Number($('transfer-limit').value), phone: $('contact-phone').value.trim() }; }
function saveSettings() {
  if (!$('transfer-limit').checkValidity() || $('transfer-limit').value === '') { $('transfer-limit').reportValidity(); $('settings-status').textContent = 'Enter a payment limit between $0 and $1,000,000.'; return; }
  try { localStorage.setItem('sentio-settings-v2', JSON.stringify(settings())); $('settings-status').textContent = 'Saved on this device'; }
  catch { $('settings-status').textContent = 'Settings apply for this visit. Storage is unavailable.'; }
  if (state.transaction && !state.locked && !state.completed) { state.analysis = null; updateCheckout(); $('analysis-result').textContent = 'Rules changed. Check the transcript again before continuing.'; saveSession(); }
}
for (const id of ['wire-lock', 'gift-lock', 'transfer-limit', 'contact-phone']) $(id).addEventListener('change', saveSettings);
function updateCheckout() {
  $('checkout-summary').textContent = state.transaction ? `${money(state.transaction.amount)} · ${state.transaction.recipient}` : 'No payment selected';
  $('checkout-button').disabled = state.busy || state.locked || !state.analysis || !state.transaction || state.completed || !state.connected;
  $('checkout-button').textContent = state.completed ? 'Demo complete' : state.receipt?.decision === 'VETO' ? 'Payment vetoed' : state.locked ? 'Payment locked' : state.analysis ? 'Complete demo payment' : 'Awaiting analysis';
}
function renderVitals() {
  const bio = currentBiometrics();
  const calm = bio && bio.stressIndex < 60;
  $('connection').textContent = state.connected ? '● Companion connected' : 'Connection unavailable';
  $('connection').className = `badge ${state.connected ? '' : 'warning'}`;
  $('parent-status').textContent = !state.connected ? 'Offline' : state.locked ? 'Payment paused' : calm ? 'Looking good' : 'Elevated stress';
  $('vitals-source').textContent = opticalAvailable() && !state.demoScenario ? 'Camera pulse estimate · Stress & other vitals simulated' : state.demoScenario ? (opticalAvailable() ? 'Scenario vitals simulated · Camera estimate shown separately' : 'Scenario vitals simulated · Camera not in use') : 'Simulated vitals · Camera signal unavailable';
  $('family-pulse').textContent = $('guardian-pulse').textContent = state.connected && bio ? Math.round(bio.heartRate) : '—';
  $('stress').textContent = !state.connected ? 'Unavailable' : calm ? 'Relaxed' : 'Elevated';
  $('guardian-mood').textContent = !state.connected ? 'Offline' : calm ? 'Calm' : 'Elevated';
  $('last-seen').textContent = state.connected ? 'Updated just now' : 'Unable to refresh vitals';
  $('shield-status').textContent = state.connected ? 'Swivel Shield Active · Demo protection ready' : 'Your shield needs a connection';
  $('guardian-description').textContent = state.connected ? 'Go about your day. We’re here to help you take a safer pause.' : 'We cannot check your protection right now. Please ask your family to check the connection.';
  updateCheckout();
}
async function getVitals() {
  try {
    const { telemetry } = await api('/api/biometrics');
    if (!telemetry || !Number.isFinite(telemetry.heartRate) || !Number.isFinite(telemetry.stressIndex)) throw new Error('Invalid sensor response');
    state.bio = telemetry; state.connected = true;
  } catch { state.connected = false; }
  renderVitals();
}
async function poll() { await getVitals(); state.timer = setTimeout(poll, 4000); }
function setBusy(value) {
  state.busy = value;
  document.querySelectorAll('[data-scenario]').forEach(button => { button.disabled = value || (state.locked && !state.receipt); });
  for (const id of ['analyze-button', 'reset-button']) $(id).disabled = value;
  for (const id of ['wire-lock', 'gift-lock', 'transfer-limit', 'demo-mode']) $(id).disabled = value;
  $('transcript').readOnly = value;
  updateCheckout();
}
function explanation() {
  const flags = JSON.stringify(state.analysis?.flags || {}).toLowerCase();
  if (/irs|police|arrest/.test(flags)) return 'Official agencies never demand gift cards or threaten immediate arrest over the phone. You have time to check.';
  if (/grandson|grandchild|hospital|accident/.test(flags)) return 'Before sending money, call your family on a number you already know. A frightening story is worth double-checking.';
  if (/gift card|geek squad/.test(flags)) return 'A request to fix a computer problem with gift cards is a warning sign. You do not need to share any card numbers.';
  return 'This payment needs a second look. Take your time and check the request with someone you trust.';
}
function renderIntervention() {
  $('resting').hidden = state.locked;
  $('intervention').hidden = !state.locked;
  $('paused-amount').textContent = money(state.transaction?.amount || 0);
  $('intervention-explanation').textContent = explanation();
  $('intervention-title').textContent = state.receipt?.decision === 'VETO' ? 'Your payment has been stopped. You can take your time.' : 'Take a deep breath. We have paused this payment.';
  $('intervention-foot').textContent = state.receipt?.decision === 'VETO' ? 'Your caregiver’s veto is confirmed for this demo payment.' : state.authId ? 'Your demo payment is locked and ready for family review.' : 'Your demo payment is locked. We are connecting the family review.';
  $('review-card').hidden = !state.locked && !state.receipt;
  $('review-card').querySelector('.badge').textContent = state.receipt ? 'Family review complete' : 'Family review needed';
  $('review-summary').textContent = state.transaction ? `${money(state.transaction.amount)} to ${state.transaction.recipient}` : '';
  $('veto-button').disabled = $('approve-button').disabled = !state.authId || !!state.receipt || state.busy;
  $('retry-button').hidden = !!state.authId || !!state.receipt;
  renderDispatch();
  renderVitals();
  updateCheckout();
}
async function escalate() {
  try {
    const { escalation, push } = await api('/api/caregiver/escalate', { transaction: state.transaction, analysis: state.analysis, biometrics: state.incidentBio || currentBiometrics() });
    if (!escalation?.authId) throw new Error('No review receipt returned');
    state.authId = escalation.authId;
    state.dispatch = { time: escalation.createdAt, pulse: escalation.vitalSigns?.heartRate, push };
    $('review-status').textContent = `Review ${state.authId} ready. SMS is simulated.${push === 'attempted' ? ' Backend push requested; delivery not confirmed.' : ''}`;
  } catch (error) { $('review-status').textContent = `Family review unavailable: ${error.message}. Payment remains locked.`; }
  saveSession(); renderIntervention();
}
async function checkTranscript(scenario, fromMic = false) {
  if (state.busy) return;
  if (state.locked && !state.receipt) { notice('Review or veto the paused payment before starting another scenario.'); return; }
  if (!scenario && state.locked) { notice('Reset the demo before checking another payment.'); return; }
  if (!scenario && !$('transcript').value.trim()) { $('transcript').focus(); notice('Add a transcript or choose a scenario first.'); return; }
  if (!$('transfer-limit').checkValidity() || $('transfer-limit').value === '') { $('transfer-limit').reportValidity(); return; }
  setBusy(true); if (!fromMic) stopMic();
  clearTimeout(noticeTimer); $('notice').hidden = true;
  state.analysis = null; state.receipt = null; state.authId = null; state.completed = false; state.script = ''; state.incidentId = null;
  if (scenario) {
    const preset = presets[scenario];
    $('transcript').value = preset.transcript;
    state.transaction = { amount: preset.amount, recipient: preset.recipient, rail: preset.rail };
  } else {
    // Freeform audio uses a clearly labeled demo transaction, never a real checkout.
    state.transaction = { amount: 100, recipient: 'Live audio demo payment', rail: 'unknown' };
  }
  state.demoScenario = !!scenario;
  state.dispatch = null; $('call-simulation').hidden = true;
  state.locked = false; renderIntervention(); updateCheckout();
  const checkedTranscript = $('transcript').value.trim();
  $('analysis-result').textContent = 'Checking the conversation and current vitals…';
  try {
    if (scenario) { await api('/api/biometrics/mode', { mode: presets[scenario].mode }); $('demo-mode').value = state.selectedMode = presets[scenario].mode; }
    await getVitals();
    if (!state.connected) throw new Error('Biometrics unavailable; payment cannot be cleared');
    state.incidentBio = { ...currentBiometrics() };
    const { analysis, incident } = await api('/api/detect', { transcript: checkedTranscript, biometrics: state.incidentBio, transaction: state.transaction });
    if (!analysis || !['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(analysis.riskTier)) throw new Error('Invalid detection response');
    state.analysis = analysis;
    const rules = settings();
    const words = checkedTranscript;
    const rulePause = state.transaction.amount > rules.limit || (rules.wire && (state.transaction.rail === 'wire' || /\bwire\b/i.test(words))) || (rules.gift && (state.transaction.rail === 'gift' || /gift cards?/i.test(words)));
    state.locked = ['HIGH', 'CRITICAL', 'MEDIUM'].includes(analysis.riskTier) || rulePause;
    $('analysis-result').textContent = state.locked ? `${analysis.riskTier === 'LOW' ? 'Protection rule matched' : 'Pressure signals detected'}. Payment paused for family review.` : 'No coercion signals detected in this sample. Demo payment is ready.';
    $('analysis-result').textContent += ` Pulse ${state.incidentBio.heartRate} bpm · stress ${state.incidentBio.stressIndex}/100 (${state.demoScenario || !opticalAvailable() ? 'simulated' : 'camera pulse; simulated stress'}).`;
    if (state.locked) {
      stopMic();
      state.incidentId = incident?.incident_id || `local-${Date.now()}`;
      state.entries.unshift({ incident_id: state.incidentId, detected_at: new Date().toISOString(), recipient_alias: state.transaction.recipient, amount: state.transaction.amount, flags: Object.values(analysis.flags || {}).flat(), pulse: state.incidentBio.heartRate, stress: state.incidentBio.stressIndex, pulseSource: state.demoScenario || !opticalAvailable() ? 'simulated' : 'camera estimate', payment_rail: incident?.payment_rail || state.transaction.rail.toUpperCase(), risk_score: analysis.score, receipt: null });
      saveSession(); renderIntervention(); renderAudit(); view('guardian', true);
      await escalate();
    }
    if (!state.locked && $('transcript').value.trim() !== checkedTranscript) {
      state.analysis = null;
      $('analysis-result').textContent = 'New speech received. Waiting for the next complete phrase to check.';
    }
    saveSession(); await refreshAudit();
  } catch (error) {
    // An unknown outcome must never enable checkout.
    state.analysis = null;
    $('analysis-result').textContent = `Check unavailable: ${error.message}. Checkout remains disabled.`;
    notice('Could not complete the safety check. Your demo payment has not moved.');
    saveSession();
  } finally { setBusy(false); renderIntervention(); }
}
for (const button of document.querySelectorAll('[data-scenario]')) button.addEventListener('click', () => checkTranscript(button.dataset.scenario));
$('analyze-button').addEventListener('click', () => checkTranscript());
$('transcript').addEventListener('input', () => { if (!state.locked) { state.analysis = null; state.completed = false; updateCheckout(); } });
$('checkout-button').addEventListener('click', () => {
  if (state.busy || state.locked || !state.analysis || !state.connected || state.completed) return;
  state.completed = true; updateCheckout(); saveSession(); notice('Demo payment completed. No real money was transferred.');
});
async function decision(action) {
  if (!state.authId || state.receipt || state.busy) return;
  setBusy(true); renderIntervention();
  try {
    const { result } = await api('/api/caregiver/decision', { authId: state.authId, decision: action });
    const expected = action === 'VETO' ? 'BLOCKED_BY_CAREGIVER' : 'CLEARED_BY_CAREGIVER';
    if (!result?.success || result.status !== expected) throw new Error(result?.reason || 'Decision was not confirmed; payment stays locked');
    state.receipt = { decision: action, authId: state.authId, time: new Date().toISOString() };
    state.locked = action === 'VETO';
    $('analysis-result').textContent = action === 'APPROVE' ? 'Emily approved this payment. The hold is cleared; you can complete the demo checkout.' : 'Emily vetoed this payment. Permanently blocked in this demo.';
    $('call-simulation').hidden = true;
    const entry = state.entries.find(item => item.incident_id === state.incidentId);
    if (entry) entry.receipt = state.receipt;
    $('review-status').textContent = `${action === 'VETO' ? 'Veto' : 'Approval'} confirmed · ${state.authId}`;
    saveSession(); renderAudit(); notice(action === 'VETO' ? 'Caregiver veto confirmed. The demo payment is stopped.' : 'Caregiver approval confirmed.');
  } catch (error) {
    if (error.message === 'NOT_FOUND') {
      state.authId = null; state.dispatch = null; saveSession();
      $('review-status').textContent = 'This review expired or the demo server restarted. Retry family review; the payment stays locked.';
    } else $('review-status').textContent = `${error.message}. No decision receipt was recorded.`;
  }
  finally { setBusy(false); renderIntervention(); }
}
$('veto-button').addEventListener('click', () => decision('VETO'));
$('approve-button').addEventListener('click', () => decision('APPROVE'));
$('retry-button').addEventListener('click', async () => { if (state.busy) return; setBusy(true); await escalate(); setBusy(false); renderIntervention(); });
$('reset-button').addEventListener('click', async () => {
  if (state.busy) return;
  if (state.locked && !state.receipt) { notice('Veto or resolve the active family review first. Reset cannot release a paused payment.'); return; }
  setBusy(true); stopMic(); window.speechSynthesis?.cancel();
  try {
    await api('/api/biometrics/mode', { mode: 'calm' });
    Object.assign(state, { transaction: null, analysis: null, locked: false, completed: false, authId: null, receipt: null, incidentId: null, script: '', demoScenario: false, dispatch: null, incidentBio: null });
    $('demo-mode').value = state.selectedMode = 'calm'; $('call-simulation').hidden = true;
    $('transcript').value = ''; $('analysis-result').textContent = 'Ready when you are. Select a scenario above.';
    await getVitals(); saveSession(); renderIntervention();
  } catch (error) { notice(`Could not reset: ${error.message}`); }
  finally { setBusy(false); }
});
function renderAudit() {
  const merged = new Map(state.serverEntries.map(item => [item.incident_id, item]));
  for (const entry of state.entries) {
    const server = merged.get(entry.incident_id);
    // Server is authoritative for transaction, rail, score and coercion flags.
    merged.set(entry.incident_id, { ...entry, ...server, pulse: entry.pulse, stress: entry.stress, pulseSource: entry.pulseSource, receipt: entry.receipt, flags: server ? Object.values(server.coercion_flags || {}).flat() : entry.flags });
  }
  const entries = [...merged.values()].sort((a, b) => new Date(b.detected_at) - new Date(a.detected_at)).slice(0, 50);
  $('audit-body').replaceChildren();
  if (!entries.length) { const row = $('audit-body').insertRow(); const cell = row.insertCell(); cell.colSpan = 5; cell.className = 'empty-state'; cell.textContent = 'No intercepted payments yet. A quiet day is a good day.'; return; }
  for (const entry of entries) {
    const row = $('audit-body').insertRow();
    const cell = text => { const td = row.insertCell(); td.textContent = text; return td; };
    const detail = (target, text) => { const small = document.createElement('small'); small.textContent = text; target.append(small); };
    const date = new Date(entry.detected_at);
    const time = cell(Number.isNaN(date.valueOf()) ? 'Time unavailable' : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    if (!Number.isNaN(date.valueOf())) detail(time, date.toLocaleDateString([], { month: 'short', day: 'numeric' }));
    const payment = cell(entry.recipient_alias || 'Unverified recipient'); detail(payment, money(entry.amount ?? entry.attempted_amount ?? 0));
    const risk = cell('');
    const rail = document.createElement('span'); rail.className = 'rail-badge'; rail.textContent = (entry.payment_rail || 'UNKNOWN').replaceAll('_', ' '); risk.append(rail);
    detail(risk, Number.isFinite(entry.risk_score) ? `Risk ${entry.risk_score}/100` : 'Score unavailable');
    const flags = entry.flags || Object.values(entry.coercion_flags || {}).flat();
    const signals = cell(flags.length ? flags.join(' · ') : 'Protection rule / server incident');
    detail(signals, Number.isFinite(entry.pulse) ? `Pulse ${entry.pulse} bpm (${entry.pulseSource || "simulated"}) · Stress ${entry.stress}/100 (simulated)` : 'Biometric snapshot not supplied by server');
    const receipt = cell(entry.receipt ? `${entry.receipt.decision === 'VETO' ? 'Veto' : 'Approval'} confirmed` : 'No confirmed family receipt');
    if (entry.receipt) detail(receipt, `${entry.receipt.authId} · ${new Date(entry.receipt.time).toLocaleTimeString()}`);
  }
}
async function refreshAudit() {
  if (auditBusy) return; auditBusy = true;
  try { const data = await api('/api/tigerdata/rollup'); if (!Array.isArray(data.incidents)) throw new Error('Invalid ledger'); state.serverEntries = data.incidents; renderAudit(); $('audit-status').textContent = 'Server ledger updated. Call signals and family receipts from this session are shown alongside it.'; }
  catch { $('audit-status').textContent = 'Server ledger unavailable. Showing saved session details.'; renderAudit(); }
  finally { auditBusy = false; }
}
$('refresh-button').addEventListener('click', refreshAudit);
function micUI() {
  $('mic-button').setAttribute('aria-pressed', String(state.listening));
  $('mic-button').querySelector('span').textContent = state.listening ? 'Stop microphone' : 'Start microphone';
  $('guardian-listening').textContent = state.listening ? 'Listening gently · Call protection is on' : 'Microphone off · Ready when you are';
}
function stopMic() { clearTimeout(micTimer); state.listening = false; state.recognition?.stop(); micUI(); }
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!Recognition) { $('mic-button').disabled = true; $('mic-status').textContent = 'Speech recognition is unavailable here. Type a transcript or use a scenario.'; }
else {
  const recognition = new Recognition(); state.recognition = recognition;
  recognition.lang = 'en-US'; recognition.continuous = true; recognition.interimResults = true;
  let finalized = '';
  recognition.onstart = () => { state.listening = true; micUI(); $('mic-status').textContent = 'Listening. Final speech is checked automatically.'; };
  recognition.onresult = event => {
    let interim = '', receivedFinal = false;
    for (let index = event.resultIndex; index < event.results.length; index++) {
      if (event.results[index].isFinal) { finalized += `${event.results[index][0].transcript} `; receivedFinal = true; }
      else interim += event.results[index][0].transcript;
    }
    $('transcript').value = (finalized + interim).slice(-6000);
    if (!state.locked) { state.analysis = null; updateCheckout(); }
    if (receivedFinal) { clearTimeout(micTimer); micTimer = setTimeout(() => { if (!state.busy && !state.locked) checkTranscript(undefined, true); }, 900); }
  };
  recognition.onerror = event => { stopMic(); $('mic-status').textContent = event.error === 'not-allowed' ? 'Microphone permission was denied. Allow it in browser settings or type a transcript.' : `Microphone stopped (${event.error}). Try again or type a transcript.`; };
  recognition.onend = () => { state.listening = false; micUI(); if ($('mic-status').textContent.startsWith('Listening')) $('mic-status').textContent = 'Microphone stopped. Start again to listen.'; };
  $('mic-button').addEventListener('click', () => {
    if (state.listening) { stopMic(); return; }
    if (state.busy || state.locked) { notice('Finish the current review before starting the microphone.'); return; }
    window.speechSynthesis?.cancel(); finalized = ''; $('transcript').value = ''; state.analysis = null; updateCheckout();
    try { recognition.start(); $('mic-status').textContent = 'Waiting for microphone permission…'; } catch { notice('Microphone is already starting. Please try again in a moment.'); }
  });
}
$('voice-button').addEventListener('click', async () => {
  if (!('speechSynthesis' in window)) { notice('Audio is unavailable in this browser. The guidance is written above.'); return; }
  if (speechSynthesis.speaking) { speechSynthesis.cancel(); return; }
  stopMic(); $('voice-button').disabled = true;
  try {
    const { script } = await api('/api/voice/intervention', { analysis: state.analysis || { flags: {}, score: 50 } });
    state.script = typeof script?.text === 'string' ? script.text.replace(/Sarah/g, 'Emily') : '';
  } catch { state.script = ''; }
  const speech = new SpeechSynthesisUtterance(state.script || `Take a slow breath. Your demo payment is paused. ${explanation()} You can ask Emily to look at this with you.`);
  speech.lang = 'en-US'; speech.rate = .85; speech.pitch = 1; state.speech = speech;
  const reset = () => { $('voice-button').querySelector('span').textContent = 'Listen to calming audio guide'; state.speech = null; };
  speech.onend = reset; speech.onerror = event => { reset(); if (!['canceled', 'interrupted'].includes(event.error)) notice('Audio could not play. Please read the guidance above.'); };
  $('voice-button').disabled = false; $('voice-button').querySelector('span').textContent = 'Stop calming audio'; speechSynthesis.speak(speech);
});
$('qa-button').addEventListener('click', async () => {
  $('qa-button').disabled = true; $('qa-result').textContent = 'Running backend diagnostic checks…';
  try { const { report } = await api('/api/qa/run'); if (!Number.isFinite(report?.passed) || !Number.isFinite(report?.total)) throw new Error('Invalid diagnostic report'); $('qa-result').textContent = `${report.passed} of ${report.total} backend checks passed${Number.isFinite(report.benchmarks?.avgLatencyMs) ? ` · Average detection ${report.benchmarks.avgLatencyMs} ms` : ''}. Browser permissions and real payment/SMS connections are not covered.`; }
  catch (error) { $('qa-result').textContent = `System check unavailable: ${error.message}`; }
  finally { $('qa-button').disabled = false; }
});
async function initialize() {
  try {
    const saved = JSON.parse(localStorage.getItem('sentio-settings-v2'));
    if (saved) { $('wire-lock').checked = saved.wire !== false; $('gift-lock').checked = saved.gift !== false; if (Number.isFinite(saved.limit) && saved.limit >= 0 && saved.limit <= 1000000) $('transfer-limit').value = saved.limit; $('contact-phone').value = typeof saved.phone === 'string' ? saved.phone : ''; }
    const session = JSON.parse(sessionStorage.getItem('sentio-session-v2'));
    if (session && Array.isArray(session.entries)) { for (const key of ['transaction', 'analysis', 'locked', 'completed', 'authId', 'receipt', 'incidentId', 'entries', 'script', 'demoScenario', 'dispatch', 'incidentBio', 'selectedMode']) if (key in session) state[key] = session[key]; }
  } catch { /* Storage can be disabled; the current session remains usable. */ }
  // An unlocked prior analysis is stale after navigation. Require a fresh check.
  if (!state.locked && state.receipt?.decision !== 'APPROVE') state.analysis = null;
  $('demo-mode').value = ['calm','elevated','panic'].includes(state.selectedMode) ? state.selectedMode : '';
  renderIntervention(); renderAudit(); setBusy(false);
  if (state.locked) {
    $('review-status').textContent = state.receipt ? `Saved ${state.receipt.decision} receipt · ${state.authId}` : `Pending review ${state.authId || 'not yet connected'}. Payment remains locked.`;
    if (state.authId && !state.receipt) {
      try { const { escalation } = await api(`/api/caregiver/status/${encodeURIComponent(state.authId)}`); if (['BLOCKED_BY_CAREGIVER', 'CLEARED_BY_CAREGIVER'].includes(escalation.status)) { state.locked = escalation.status === 'BLOCKED_BY_CAREGIVER'; state.receipt = { decision: state.locked ? 'VETO' : 'APPROVE', authId: state.authId, time: escalation.resolvedAt }; const entry = state.entries.find(item => item.incident_id === state.incidentId); if (entry) entry.receipt = state.receipt; saveSession(); } }
      catch { state.authId = null; $('review-status').textContent = 'Previous review is unavailable. Retry family review; payment stays locked.'; }
      renderIntervention(); setBusy(false);
    }
  }
  await Promise.allSettled([poll(), refreshAudit()]);
}
window.addEventListener('pagehide', () => { stopCamera(); clearTimeout(state.timer); stopMic(); window.speechSynthesis?.cancel(); });
window.addEventListener('pageshow', event => { if (event.persisted) { clearTimeout(state.timer); poll(); } });
// Optical pulse processing is local only: no frames or pixel data leave this page.
const optical = { stream: null, samples: [], bpm: null, lockedAt: 0, candidates: [], frame: null, lastSample: 0, lastEstimate: 0, generation: 0, pending: false, lastPixels: null };
const sampleCanvas = document.createElement('canvas'); sampleCanvas.width = 40; sampleCanvas.height = 20;
const sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true });
function opticalAvailable() { return optical.bpm !== null && performance.now() - optical.lockedAt < 4000 && !!optical.stream; }
function currentBiometrics() {
  if (!state.bio) return null;
  return { ...state.bio, heartRate: opticalAvailable() && !state.demoScenario ? optical.bpm : state.bio.heartRate };
}
// Pure estimator: timestamped green-channel averages, not simulated heart-rate values.
function estimateOpticalPulse(samples) {
  if (samples.length < 180) return null;
  const span = (samples.at(-1).time - samples[0].time) / 1000;
  if (span < 12 || span > 25) return null;
  const fps = (samples.length - 1) / span;
  if (fps < 10 || samples.some((s, i) => i && s.time - samples[i - 1].time > 350)) return null;
  // Resample timestamps onto a uniform 15 Hz grid before spectral analysis.
  const values = [], rate = 15; let cursor = 1;
  for (let t = samples[0].time; t <= samples.at(-1).time; t += 1000 / rate) {
    while (cursor < samples.length - 1 && samples[cursor].time < t) cursor++;
    const a = samples[cursor - 1], b = samples[cursor];
    values.push(a.green + (b.green - a.green) * (t - a.time) / Math.max(1, b.time - a.time));
  }
  const n = values.length, mean = values.reduce((a,b) => a+b, 0) / n;
  if (mean < 35 || mean > 225) return null;
  const center = (n - 1) / 2;
  let slopeNumerator = 0, slopeDenominator = 0;
  values.forEach((value, i) => { slopeNumerator += (i-center) * (value-mean); slopeDenominator += (i-center) ** 2; });
  const slope = slopeNumerator / slopeDenominator;
  const detrended = values.map((value,i) => value - mean - slope * (i-center));
  const rms = Math.sqrt(detrended.reduce((sum,value) => sum+value*value,0)/n);
  if (rms / mean < .00015 || rms / mean > .02) return null;
  const windowed = detrended.map((value,i) => value * (.5 - .5 * Math.cos(2*Math.PI*i/(n-1))));
  const spectrum = [];
  for (let frequency = .75; frequency <= 3; frequency += .025) {
    let real = 0, imaginary = 0;
    windowed.forEach((value,i) => { const phase = 2*Math.PI*frequency*i/rate; real += value*Math.cos(phase); imaginary += value*Math.sin(phase); });
    spectrum.push({ frequency, power: real*real + imaginary*imaginary });
  }
  const peak = spectrum.reduce((a,b) => a.power > b.power ? a : b);
  const sorted = spectrum.map(s => s.power).sort((a,b) => a-b);
  const median = sorted[Math.floor(sorted.length/2)];
  const total = spectrum.reduce((a,b) => a+b.power,0);
  const concentrated = spectrum.filter(s => Math.abs(s.frequency-peak.frequency) <= .12).reduce((a,b) => a+b.power,0) / total;
  const lag = Math.round(rate/peak.frequency);
  let correlation = 0, left = 0, right = 0;
  for (let i=lag;i<n;i++) { correlation += detrended[i]*detrended[i-lag]; left += detrended[i]**2; right += detrended[i-lag]**2; }
  const periodicity = correlation / Math.sqrt(left*right);
  if (peak.power < median*8 || concentrated < .45 || periodicity < .55) return null;
  return { bpm: Math.round(peak.frequency*60), quality: concentrated, periodicity };
}
function clearOpticalSignal() { optical.samples = []; optical.candidates = []; optical.bpm = null; optical.lastPixels = null; }
function stopCamera(message = 'Simulated vitals · Camera off') {
  optical.generation++; optical.pending = false;
  if (optical.frame !== null) cancelAnimationFrame(optical.frame);
  const stream = optical.stream; optical.stream = null;
  stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
  $('camera-video').srcObject = null; clearOpticalSignal();
  $('camera-stage').hidden = $('optical-progress-wrap').hidden = true;
  $('camera-button').textContent = 'Enable camera'; $('camera-button').setAttribute('aria-pressed','false');
  $('optical-status').textContent = message; renderVitals();
}
function drawReticle(width, height) {
  const canvas = $('face-reticle');
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  ctx.clearRect(0,0,width,height);
  ctx.strokeStyle = opticalAvailable() ? '#99e3c4' : '#f8fafc'; ctx.lineWidth = Math.max(2,width/250);
  ctx.setLineDash([width*.018,width*.013]);
  ctx.beginPath(); ctx.ellipse(width*.5,height*.48,width*.23,height*.37,0,0,Math.PI*2); ctx.stroke();
  ctx.setLineDash([]); ctx.strokeRect(width*.39,height*.22,width*.22,height*.09);
}
function cameraFrame(time) {
  if (!optical.stream) return;
  optical.frame = requestAnimationFrame(cameraFrame);
  if (time-optical.lastSample < 60) return; optical.lastSample = time;
  const video = $('camera-video');
  if (video.readyState < 2 || !video.videoWidth || !sampleContext) return;
  const width = video.videoWidth, height = video.videoHeight;
  $('camera-stage').style.aspectRatio = `${width}/${height}`;
  drawReticle(width,height);
  // The on-screen forehead guide maps exactly to this central, user-aligned ROI.
  sampleContext.drawImage(video,width*.39,height*.22,width*.22,height*.09,0,0,40,20);
  const pixels = sampleContext.getImageData(0,0,40,20).data;
  let green = 0, red = 0, blue = 0, clipped = 0, motion = 0;
  for (let i=0;i<pixels.length;i+=4) {
    red+=pixels[i]; green+=pixels[i+1]; blue+=pixels[i+2];
    if (pixels[i+1]<15 || pixels[i+1]>245) clipped++;
    if (optical.lastPixels) motion+=Math.abs(pixels[i+1]-optical.lastPixels[i+1]);
  }
  const count = pixels.length/4; green/=count; red/=count; blue/=count; motion/=count;
  const previous = optical.samples.at(-1);
  const unstable = green < 35 || green > 225 || clipped/count > .15 || motion > 8 || (previous && (Math.abs(green-previous.green)>2.5 || time-previous.time>350));
  // Neutral/green objects are rejected, but this is not face detection or a medical skin classifier.
  const skinCandidate = red > green*.95 && red > blue*1.05;
  if (unstable || !skinCandidate) {
    clearOpticalSignal(); $('optical-progress').value = 0;
    $('optical-status').textContent = 'Finding a steady signal · Simulated vitals in use';
    renderVitals(); return;
  }
  optical.lastPixels = new Uint8ClampedArray(pixels);
  optical.samples.push({time,green});
  optical.samples = optical.samples.filter(s => time-s.time <= 20000);
  const seconds = (time-optical.samples[0].time)/1000;
  $('optical-progress').value = seconds;
  if (time-optical.lastEstimate > 1000) {
    optical.lastEstimate = time;
    const estimate = estimateOpticalPulse(optical.samples);
    if (estimate) {
      optical.candidates.push(estimate.bpm); optical.candidates = optical.candidates.slice(-3);
      if (optical.candidates.length === 3 && Math.max(...optical.candidates)-Math.min(...optical.candidates) <= 6) {
        optical.bpm = Math.round(optical.candidates.reduce((a,b)=>a+b,0)/3); optical.lockedAt = time;
      } else optical.bpm = null;
    } else { optical.bpm = null; optical.candidates = []; }
    $('optical-status').textContent = opticalAvailable() ? `rPPG optical signal locked · ${optical.bpm} bpm (estimate)` : `Gathering a steady signal · ${Math.min(20,Math.floor(seconds))}/20 sec · Simulated vitals`;
    renderVitals();
  }
}
$('camera-button').addEventListener('click', async () => {
  if (optical.stream || optical.pending) { stopCamera(); return; }
  if (!navigator.mediaDevices?.getUserMedia || !sampleContext) { stopCamera('Simulated vitals · Camera unavailable in this browser'); return; }
  const generation = ++optical.generation; optical.pending = true;
  $('camera-button').textContent = 'Cancel camera'; $('optical-status').textContent = 'Waiting for camera permission · Simulated vitals in use';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    if (generation !== optical.generation) { stream.getTracks().forEach(track=>track.stop()); return; }
    optical.pending = false; optical.stream = stream;
    stream.getVideoTracks().forEach(track => { track.onended = () => stopCamera('Simulated vitals · Camera disconnected'); });
    $('camera-video').srcObject = stream;
    await $('camera-video').play();
    if (generation !== optical.generation) return;
    $('camera-stage').hidden = $('optical-progress-wrap').hidden = false;
    $('camera-button').textContent = 'Turn camera off'; $('camera-button').setAttribute('aria-pressed','true');
    $('optical-status').textContent = 'Sit still in even light. Align your forehead with the guide.';
    optical.frame = requestAnimationFrame(cameraFrame);
  } catch { if (generation === optical.generation) stopCamera('Simulated vitals · Camera unavailable or permission declined'); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && (optical.stream || optical.pending)) stopCamera('Simulated vitals · Camera paused while away'); });
$('demo-mode').addEventListener('change', async () => {
  const mode = $('demo-mode').value;
  if (state.busy) return; setBusy(true);
  try { await api('/api/biometrics/mode',{mode}); state.selectedMode = mode; if (!state.locked) state.analysis = null; state.demoScenario = true; await getVitals(); $('analysis-result').textContent = `${mode[0].toUpperCase()+mode.slice(1)} vitals simulated. Check a transcript to combine speech and stress signals.`; saveSession(); }
  catch (error) { notice(`Could not change simulated vitals: ${error.message}`); }
  finally { setBusy(false); renderIntervention(); }
});
function renderDispatch() {
  const hasPayment = !!state.transaction && !!state.analysis && (state.locked || !!state.receipt);
  const pulse = state.dispatch?.pulse ?? state.incidentBio?.heartRate;
  $('dispatch-message').textContent = hasPayment ? `URGENT: ${money(state.transaction.amount)} payment to “${state.transaction.recipient}” needs your review. ${state.analysis.coercionDetected ? 'Coercion signals detected. ' : 'A protection rule was triggered. '}${Number.isFinite(pulse) ? `Pulse ${Math.round(pulse)} BPM. ` : ''}The demo payment is paused until you decide.` : 'When a payment needs a second look, your family alert will appear here.';
  if (state.receipt) $('dispatch-message').textContent = state.receipt.decision === 'VETO' ? `${money(state.transaction.amount)} to “${state.transaction.recipient}”: permanently blocked in this demo. Your veto is confirmed.` : `${money(state.transaction.amount)} to “${state.transaction.recipient}”: approved by you. The demo hold is cleared.`;
  const date = new Date(state.dispatch?.time || state.receipt?.time || Date.now());
  $('dispatch-time').textContent = hasPayment ? `Today ${date.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}` : 'Your family’s safety line';
  $('dispatch-receipt').textContent = state.receipt ? `${state.receipt.decision === 'VETO' ? 'Permanently blocked' : 'Approved · Hold cleared'} · ${state.receipt.authId}` : state.authId ? `Demo alert ready · ${state.authId}` : hasPayment ? 'Connecting family review…' : 'Standing by · No real SMS';
  $('dispatch-veto').disabled = !state.authId || !!state.receipt || state.busy;
  $('dispatch-call').disabled = !hasPayment || state.busy;
}
$('dispatch-veto').addEventListener('click', () => decision('VETO'));
$('dispatch-call').addEventListener('click', () => { $('call-simulation').hidden = false; $('end-call').focus(); });
$('end-call').addEventListener('click', () => { $('call-simulation').hidden = true; $('dispatch-call').focus(); });

initialize();
