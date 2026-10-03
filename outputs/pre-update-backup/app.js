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
  geek: { amount: 1200, recipient: 'Geek Squad Support', rail: 'gift', mode: 'panic', transcript: 'This is Geek Squad tech support. Buy Apple gift cards immediately to fix your frozen account. Read the numbers to me and keep this confidential. Do not hang up.' },
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
  try { sessionStorage.setItem('sentio-session-v2', JSON.stringify({ transaction: state.transaction, analysis: state.analysis, locked: state.locked, completed: state.completed, authId: state.authId, receipt: state.receipt, incidentId: state.incidentId, entries: state.entries.slice(0, 50), script: state.script })); }
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
  const bio = state.bio;
  const calm = bio && bio.stressIndex < 60;
  $('connection').textContent = state.connected ? '● Companion connected' : 'Connection unavailable';
  $('connection').className = `badge ${state.connected ? '' : 'warning'}`;
  $('parent-status').textContent = !state.connected ? 'Offline' : state.locked ? 'Payment paused' : calm ? 'Looking good' : 'Elevated stress';
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
  for (const id of ['wire-lock', 'gift-lock', 'transfer-limit']) $(id).disabled = value;
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
  updateCheckout();
}
async function escalate() {
  try {
    const { escalation } = await api('/api/caregiver/escalate', { transaction: state.transaction, analysis: state.analysis, biometrics: state.bio });
    if (!escalation?.authId) throw new Error('No review receipt returned');
    state.authId = escalation.authId;
    $('review-status').textContent = `Review ${state.authId} ready. SMS is simulated; no message was sent.`;
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
  state.locked = false; renderIntervention(); updateCheckout();
  const checkedTranscript = $('transcript').value.trim();
  $('analysis-result').textContent = 'Checking the conversation and current vitals…';
  try {
    if (scenario) await api('/api/biometrics/mode', { mode: presets[scenario].mode });
    await getVitals();
    if (!state.connected) throw new Error('Biometrics unavailable; payment cannot be cleared');
    const { analysis, incident } = await api('/api/detect', { transcript: checkedTranscript, biometrics: state.bio, transaction: state.transaction });
    if (!analysis || !['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(analysis.riskTier)) throw new Error('Invalid detection response');
    state.analysis = analysis;
    const rules = settings();
    const words = checkedTranscript;
    const rulePause = state.transaction.amount > rules.limit || (rules.wire && (state.transaction.rail === 'wire' || /\bwire\b/i.test(words))) || (rules.gift && (state.transaction.rail === 'gift' || /gift cards?/i.test(words)));
    state.locked = ['HIGH', 'CRITICAL', 'MEDIUM'].includes(analysis.riskTier) || rulePause;
    $('analysis-result').textContent = state.locked ? `${analysis.riskTier === 'LOW' ? 'Protection rule matched' : 'Pressure signals detected'}. Payment paused for family review.` : 'No coercion signals detected in this sample. Demo payment is ready.';
    if (state.locked) {
      stopMic();
      state.incidentId = incident?.incident_id || `local-${Date.now()}`;
      state.entries.unshift({ incident_id: state.incidentId, detected_at: new Date().toISOString(), recipient_alias: state.transaction.recipient, amount: state.transaction.amount, flags: Object.values(analysis.flags || {}).flat(), pulse: state.bio.heartRate, stress: state.bio.stressIndex, receipt: null });
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
    if (!result?.success || result.status !== expected) throw new Error(result?.reason === 'INVALID_ACTION' ? 'The backend does not currently support APPROVE. Payment stays locked' : result?.reason || 'Decision was not confirmed');
    state.receipt = { decision: action, authId: state.authId, time: new Date().toISOString() };
    state.locked = action === 'VETO';
    const entry = state.entries.find(item => item.incident_id === state.incidentId);
    if (entry) entry.receipt = state.receipt;
    $('review-status').textContent = `${action === 'VETO' ? 'Veto' : 'Approval'} confirmed · ${state.authId}`;
    saveSession(); renderAudit(); notice(action === 'VETO' ? 'Caregiver veto confirmed. The demo payment is stopped.' : 'Caregiver approval confirmed.');
  } catch (error) { $('review-status').textContent = `${error.message}. No approval receipt was recorded.`; }
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
    Object.assign(state, { transaction: null, analysis: null, locked: false, completed: false, authId: null, receipt: null, incidentId: null, script: '' });
    $('transcript').value = ''; $('analysis-result').textContent = 'Ready when you are. Select a scenario above.';
    await getVitals(); saveSession(); renderIntervention();
  } catch (error) { notice(`Could not reset: ${error.message}`); }
  finally { setBusy(false); }
});
function renderAudit() {
  const merged = new Map(state.serverEntries.map(item => [item.incident_id, item]));
  for (const entry of state.entries) merged.set(entry.incident_id, { ...merged.get(entry.incident_id), ...entry });
  const entries = [...merged.values()].sort((a, b) => new Date(b.detected_at) - new Date(a.detected_at)).slice(0, 50);
  $('audit-body').replaceChildren();
  if (!entries.length) { const row = $('audit-body').insertRow(); const cell = row.insertCell(); cell.colSpan = 4; cell.className = 'empty-state'; cell.textContent = 'No intercepted payments yet. A quiet day is a good day.'; return; }
  for (const entry of entries) {
    const row = $('audit-body').insertRow();
    const cell = text => { const td = row.insertCell(); td.textContent = text; return td; };
    const detail = (target, text) => { const small = document.createElement('small'); small.textContent = text; target.append(small); };
    const date = new Date(entry.detected_at);
    const time = cell(Number.isNaN(date.valueOf()) ? 'Time unavailable' : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    if (!Number.isNaN(date.valueOf())) detail(time, date.toLocaleDateString([], { month: 'short', day: 'numeric' }));
    const payment = cell(entry.recipient_alias || 'Unverified recipient'); detail(payment, money(entry.amount ?? entry.attempted_amount ?? 0));
    const flags = entry.flags || Object.values(entry.coercion_flags || {}).flat();
    const signals = cell(flags.length ? flags.join(' · ') : 'Protection rule / server incident');
    detail(signals, Number.isFinite(entry.pulse) ? `Pulse ${entry.pulse} bpm · Stress ${entry.stress}/100` : 'Biometric snapshot not supplied by server');
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
    if (session && Array.isArray(session.entries)) { for (const key of ['transaction', 'analysis', 'locked', 'completed', 'authId', 'receipt', 'incidentId', 'entries', 'script']) if (key in session) state[key] = session[key]; }
  } catch { /* Storage can be disabled; the current session remains usable. */ }
  // An unlocked prior analysis is stale after navigation. Require a fresh check.
  if (!state.locked) state.analysis = null;
  renderIntervention(); renderAudit(); setBusy(false);
  if (state.locked) {
    $('review-status').textContent = state.receipt ? `Saved ${state.receipt.decision} receipt · ${state.authId}` : `Pending review ${state.authId || 'not yet connected'}. Payment remains locked.`;
    if (state.authId && !state.receipt) {
      try { const { escalation } = await api(`/api/caregiver/status/${encodeURIComponent(state.authId)}`); if (escalation.status === 'BLOCKED_BY_CAREGIVER') { state.receipt = { decision: 'VETO', authId: state.authId, time: escalation.resolvedAt }; const entry = state.entries.find(item => item.incident_id === state.incidentId); if (entry) entry.receipt = state.receipt; saveSession(); } }
      catch { state.authId = null; $('review-status').textContent = 'Previous review is unavailable. Retry family review; payment stays locked.'; }
      renderIntervention(); setBusy(false);
    }
  }
  await Promise.allSettled([poll(), refreshAudit()]);
}
window.addEventListener('pagehide', () => { clearTimeout(state.timer); stopMic(); window.speechSynthesis?.cancel(); });
window.addEventListener('pageshow', event => { if (event.persisted) { clearTimeout(state.timer); poll(); } });
initialize();
