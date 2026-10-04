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
  utility: { amount: 85, recipient: 'City Electric', rail: 'bill', mode: 'calm', transcript: 'Your monthly electric bill is 85 dollars. Review your statement and pay through your usual online account by the end of the month. Thank you.' },
  // Text-message scams: Gemini reads these as texts, and the payment is whatever the link asks for.
  usps: { channel: 'text', amount: 2, recipient: 'usps-redelivery-care.com', rail: 'card', mode: 'elevated', transcript: 'USPS: Your package is on hold due to an unpaid $1.99 redelivery fee. Pay within 12 hours at usps-redelivery-care.com or it will be returned to sender.' },
  toll: { channel: 'text', amount: 7, recipient: 'txtag-tollpay.info', rail: 'card', mode: 'elevated', transcript: 'TxTag Toll Services: You have an unpaid toll balance of $6.99. To avoid a $50 late fee and suspension of your license, pay today at txtag-tollpay.info' },
  newnumber: { channel: 'text', amount: 800, recipient: 'New number via Zelle', rail: 'p2p', mode: 'elevated', transcript: "Hi Grandpa it's me, I dropped my phone in the pool so this is my new number. I'm in a bit of trouble, can you send $800 with Zelle? Please don't tell mom, I'll explain later." },
  // Sounds normal, so it passes, unless "Family check on every money request" is on (numbers can be spoofed).
  familymoney: { channel: 'text', amount: 150, recipient: 'Emily (text request)', rail: 'p2p', mode: 'calm', transcript: "Dad, the plumber is coming Tuesday. Can you send me the $150 for your half of the repair when you get a chance?" },
  family: { channel: 'text', amount: 0, recipient: 'No payment requested', rail: 'none', mode: 'calm', transcript: "Hi Dad, it's Emily. Your pharmacy order is ready for pickup at CVS after 3pm. Want me to drive you tomorrow?" }
};
const CHANNEL_COPY = {
  call: { label: 'Live audio lab', placeholder: 'Choose a scenario, type a call transcript, or try your microphone…', check: 'Check transcript →' },
  text: { label: 'Text message lab', placeholder: 'Pick a text above, or paste any text message Granddad received…', check: 'Check message →' }
};
function setChannel(channel) {
  state.channel = channel === 'text' ? 'text' : 'call';
  const copy = CHANNEL_COPY[state.channel];
  document.querySelectorAll('[data-channel]').forEach(button => button.setAttribute('aria-checked', String(button.dataset.channel === state.channel)));
  $('text-presets').hidden = state.channel !== 'text';
  $('mic-button').hidden = state.channel === 'text';
  if (state.channel === 'text' && state.listening) stopMic();
  $('lab-label').textContent = copy.label; $('transcript').placeholder = copy.placeholder; $('analyze-button').textContent = copy.check;
}
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
  try { sessionStorage.setItem('sentio-session-v2', JSON.stringify({ transaction: state.transaction, analysis: state.analysis, locked: state.locked, completed: state.completed, authId: state.authId, receipt: state.receipt, incidentId: state.incidentId, entries: state.entries.slice(0, 50), script: state.script, demoScenario: state.demoScenario, dispatch: state.dispatch, incidentBio: state.incidentBio, selectedMode: state.selectedMode, channel: state.channel })); }
  catch { notice('This browser cannot save session history. Keep this tab open during the demo.'); }
}
function settings() { return { wire: $('wire-lock').checked, gift: $('gift-lock').checked, moneyCheck: $('money-check').checked, limit: Number($('transfer-limit').value), phone: $('contact-phone').value.trim() }; }
function saveSettings() {
  if (!$('transfer-limit').checkValidity() || $('transfer-limit').value === '') { $('transfer-limit').reportValidity(); $('settings-status').textContent = 'Enter a payment limit between $0 and $1,000,000.'; return; }
  try { localStorage.setItem('sentio-settings-v2', JSON.stringify(settings())); $('settings-status').textContent = 'Saved on this device'; }
  catch { $('settings-status').textContent = 'Settings apply for this visit. Storage is unavailable.'; }
  if (state.transaction && !state.locked && !state.completed) { state.analysis = null; updateCheckout(); $('analysis-result').textContent = 'Rules changed. Check the transcript again before continuing.'; saveSession(); }
}
for (const id of ['wire-lock', 'gift-lock', 'money-check', 'transfer-limit', 'contact-phone']) $(id).addEventListener('change', saveSettings);
function updateCheckout() {
  $('checkout-summary').textContent = state.transaction ? `${money(state.transaction.amount)} · ${state.transaction.recipient}` : 'No payment selected';
  $('checkout-button').disabled = state.busy || state.locked || !state.analysis || !state.transaction || state.completed || !state.connected;
  $('checkout-button').textContent = state.completed ? 'Demo complete' : state.receipt?.decision === 'VETO' ? 'Payment vetoed' : state.locked ? 'Payment locked' : state.analysis ? 'Complete demo payment' : 'Awaiting analysis';
}
function renderVitals() {
  const bio = currentBiometrics();
  const calm = bio && bio.stressIndex < 60;
  const mood = currentMood(bio);
  $('connection').textContent = state.connected ? '● Companion connected' : 'Connection unavailable';
  $('connection').className = `badge ${state.connected ? '' : 'warning'}`;
  $('parent-status').textContent = !state.connected ? 'Offline' : state.locked ? 'Payment paused' : calm ? 'Looking good' : 'Elevated stress';
  $('vitals-source').textContent = opticalAvailable() ? (state.demoScenario ? 'Live expression from camera · Scenario stress simulated' : 'Live expression from camera · Feeds the risk score') : state.demoScenario ? 'Scenario stress simulated · Camera off' : 'Simulated stress · Camera off';
  $('family-mood').textContent = $('guardian-mood').textContent = !state.connected ? 'Offline' : mood ? mood.label : '—';
  $('family-mood').dataset.level = $('mood-pill').dataset.level = mood?.level || 'calm';
  if (typeof renderHeart === 'function') renderHeart();
  $('guardian-mood-source').textContent = !state.connected ? 'Offline' : mood?.source === 'live' ? 'Live from camera' : 'Camera off';
  $('stress').textContent = !state.connected ? 'Unavailable' : calm ? 'Relaxed' : 'Elevated';
  $('last-seen').textContent = state.connected ? 'Updated just now' : 'Unable to refresh vitals';
  $('shield-status').textContent = state.connected ? 'Swivel Shield Active · Demo protection ready' : 'Your shield needs a connection';
  $('guardian-description').textContent = state.connected ? 'Go about your day. We’re here to help you take a safer pause.' : 'We cannot check your protection right now. Please ask your family to check the connection.';
  updateCheckout();
}
async function getVitals() {
  try {
    // With the camera live, report its reading so Tiger Data stores real expression data.
    const live = typeof opticalAvailable === 'function' && opticalAvailable();
    const { telemetry } = await api(live ? `/api/biometrics?source=camera&stress=${faceStress()}&expression=${encodeURIComponent(optical.label.label)}` : '/api/biometrics');
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
  for (const id of ['wire-lock', 'gift-lock', 'money-check', 'transfer-limit', 'demo-mode']) $(id).disabled = value;
  $('transcript').readOnly = value;
  updateCheckout();
}
function explanation() {
  if (state.channel === 'text' && state.analysis?.riskTier !== 'LOW') return 'Real companies and family don’t ask for money through a link or a new number in a text. You don’t need to tap anything or reply.';
  const flags = JSON.stringify(state.analysis?.flags || {}).toLowerCase();
  if (/irs|police|arrest/.test(flags)) return 'Real government offices never ask for payment over the phone like this. You are safe, and you can hang up whenever you like.';
  if (/grandson|grandchild|hospital|accident/.test(flags)) return 'Calls about a loved one can feel urgent. It’s always okay to call them back on a number you already know.';
  if (/gift card|geek squad/.test(flags)) return 'Real companies don’t ask to be paid with gift cards. You don’t need to share any card numbers.';
  return 'We paused this just to be safe. Take your time and check it with someone you trust.';
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
// A decision can arrive from Emily's real phone (emily.html or the ntfy buttons), so poll this
// demo server while a review is pending. Local only: no paid API is involved, and it stops on resolve.
let reviewTimer = null;
function applyRemoteDecision(escalation) {
  if (!['BLOCKED_BY_CAREGIVER', 'CLEARED_BY_CAREGIVER'].includes(escalation?.status) || state.receipt) return false;
  const action = escalation.status === 'BLOCKED_BY_CAREGIVER' ? 'VETO' : 'APPROVE';
  state.locked = action === 'VETO';
  state.receipt = { decision: action, authId: state.authId, time: escalation.resolvedAt };
  const entry = state.entries.find(item => item.incident_id === state.incidentId);
  if (entry) entry.receipt = state.receipt;
  $('review-status').textContent = `${action === 'VETO' ? 'Veto' : 'Approval'} confirmed from Emily’s phone · ${state.authId}`;
  $('analysis-result').textContent = action === 'APPROVE' ? 'Emily approved this payment from her phone. The hold is cleared.' : 'Emily vetoed this payment from her phone. Permanently blocked in this demo.';
  $('call-simulation').hidden = true;
  saveSession(); renderAudit(); renderIntervention();
  notice(action === 'VETO' ? 'Emily vetoed from her phone. The demo payment is stopped.' : 'Emily approved from her phone.');
  return true;
}
function watchReview() {
  clearTimeout(reviewTimer);
  if (!state.authId || state.receipt) return;
  reviewTimer = setTimeout(async () => {
    try { const { escalation } = await api(`/api/caregiver/status/${encodeURIComponent(state.authId)}`); if (applyRemoteDecision(escalation)) return; }
    catch { /* Server restarting; try again shortly. */ }
    watchReview();
  }, 2000);
}
async function escalate() {
  try {
    const { escalation, push } = await api('/api/caregiver/escalate', { transaction: state.transaction, analysis: state.analysis, biometrics: state.incidentBio || currentBiometrics() });
    if (!escalation?.authId) throw new Error('No review receipt returned');
    state.authId = escalation.authId;
    state.dispatch = { time: escalation.createdAt, expression: escalation.vitalSigns?.expression, push };
    $('review-status').textContent = `Review ${state.authId} ready. SMS is simulated.${push === 'attempted' ? ' Backend push requested; delivery not confirmed.' : ''}`;
  } catch (error) { $('review-status').textContent = `Family review unavailable: ${error.message}. Payment remains locked.`; }
  saveSession(); renderIntervention(); watchReview();
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
    setChannel(preset.channel || 'call');
    $('transcript').value = preset.transcript;
    state.transaction = { amount: preset.amount, recipient: preset.recipient, rail: preset.rail };
  } else {
    // Freeform audio uses a clearly labeled demo transaction, never a real checkout.
    state.transaction = state.channel === 'text' ? { amount: 100, recipient: 'Link in a text message', rail: 'unknown' } : { amount: 100, recipient: 'Live audio demo payment', rail: 'unknown' };
  }
  state.demoScenario = !!scenario;
  state.dispatch = null; $('call-simulation').hidden = true;
  state.locked = false; renderIntervention(); updateCheckout();
  const checkedTranscript = $('transcript').value.trim();
  $('analysis-result').textContent = 'Checking the conversation and current expression…';
  try {
    if (scenario) { await api('/api/biometrics/mode', { mode: presets[scenario].mode }); $('demo-mode').value = state.selectedMode = presets[scenario].mode; }
    await getVitals();
    if (!state.connected) throw new Error('Biometrics unavailable; payment cannot be cleared');
    state.incidentBio = { ...currentBiometrics() };
    const { analysis, incident } = await api('/api/detect', { transcript: checkedTranscript, biometrics: state.incidentBio, transaction: state.transaction, channel: state.channel || 'call' });
    if (!analysis || !['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(analysis.riskTier)) throw new Error('Invalid detection response');
    state.analysis = analysis;
    const rules = settings();
    const words = checkedTranscript;
    // Strictest mode: a message that asks for money waits for Emily, even if it sounds like family (numbers can be spoofed).
    const asksForMoney = state.transaction.amount > 0 || /\b(send|wire|transfer|lend|loan|zelle|venmo|cash ?app|money|pay me|\$\s?\d)/i.test(words);
    const familyCheck = rules.moneyCheck && asksForMoney;
    const rulePause = familyCheck || state.transaction.amount > rules.limit || (rules.wire && (state.transaction.rail === 'wire' || /\bwire\b/i.test(words))) || (rules.gift && (state.transaction.rail === 'gift' || /gift cards?/i.test(words)));
    state.locked = ['HIGH', 'CRITICAL', 'MEDIUM'].includes(analysis.riskTier) || rulePause;
    $('analysis-result').textContent = state.locked ? `${analysis.riskTier !== 'LOW' ? 'Pressure signals detected' : familyCheck ? 'Family check is on: every money request waits for Emily' : 'Protection rule matched'}. Payment paused for family review.` : 'No coercion signals detected in this sample. Demo payment is ready.';
    if (analysis.reason) $('analysis-result').textContent += ` Gemini: ${analysis.scamType && analysis.scamType !== 'None' ? `${analysis.scamType}. ` : ''}${analysis.reason}`;
    if (state.incidentBio.heartSource) $('analysis-result').textContent += ` Heart ${state.incidentBio.heartRate} bpm (${state.incidentBio.heartSource}).`;
    $('analysis-result').textContent += ` Expression ${state.incidentBio.expression || 'unknown'} · stress ${state.incidentBio.stressIndex}/100 (${state.incidentBio.expressionSource === 'camera' ? 'live camera' : 'simulated'}).`;
    // Every checked payment is logged, including safe ones that went through. (Live mic checks
    // run on each spoken phrase, so only a paused one is logged to keep the history readable.)
    if (state.locked || !fromMic) {
      state.incidentId = incident?.incident_id || `local-${Date.now()}`;
      state.entries.unshift({ incident_id: state.incidentId, detected_at: new Date().toISOString(), recipient_alias: state.transaction.recipient, amount: state.transaction.amount, flags: Object.values(analysis.flags || {}).flat(), expression: state.incidentBio.expression, stress: state.incidentBio.stressIndex, expressionSource: state.incidentBio.expressionSource === 'camera' ? 'live camera' : 'simulated', payment_rail: incident?.payment_rail || state.transaction.rail.toUpperCase(), risk_score: analysis.score, channel: state.channel || 'call', allowed: !state.locked, receipt: null });
      state.entries = state.entries.slice(0, 50);
      saveSession(); renderAudit();
    }
    if (state.locked) {
      stopMic();
      renderIntervention(); view('guardian', true);
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
for (const button of document.querySelectorAll('[data-channel]')) button.addEventListener('click', () => { if (!state.busy) { setChannel(button.dataset.channel); saveSession(); } });
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
// Approving releases money, so it takes a second, deliberate tap; vetoing is always one tap.
function confirmTap(button, idleLabel, action) {
  let armed = null;
  const disarm = () => { clearTimeout(armed); armed = null; button.classList.remove('confirming'); button.textContent = idleLabel; };
  button.addEventListener('click', () => {
    if (button.disabled) return;
    if (!armed) { button.classList.add('confirming'); button.textContent = `Tap again to approve ${money(state.transaction?.amount || 0)}`; armed = setTimeout(disarm, 5000); return; }
    disarm(); action();
  });
  button.addEventListener('blur', () => { if (armed) disarm(); });
}
$('veto-button').addEventListener('click', () => decision('VETO'));
confirmTap($('approve-button'), 'Approve payment', () => decision('APPROVE'));
confirmTap($('dispatch-approve'), 'Approve payment', () => decision('APPROVE'));
$('retry-button').addEventListener('click', async () => { if (state.busy) return; setBusy(true); await escalate(); setBusy(false); renderIntervention(); });
$('reset-button').addEventListener('click', async () => {
  if (state.busy) return;
  if (state.locked && !state.receipt) { notice('Veto or resolve the active family review first. Reset cannot release a paused payment.'); return; }
  setBusy(true); stopMic(); stopVoice();
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
    merged.set(entry.incident_id, { ...entry, ...server, expression: entry.expression, stress: entry.stress, expressionSource: entry.expressionSource, receipt: entry.receipt, flags: server ? Object.values(server.coercion_flags || {}).flat() : entry.flags });
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
    detail(signals, Number.isFinite(entry.stress) ? `${entry.expression ? `Looked ${entry.expression.toLowerCase()} · ` : ''}Stress ${entry.stress}/100 (${entry.expressionSource || 'simulated'})` : 'Stress snapshot not supplied by server');
    const receipt = cell(entry.receipt ? `${entry.receipt.decision === 'VETO' ? 'Veto' : 'Approval'} confirmed` : entry.allowed ? 'Allowed · no review needed' : 'No confirmed family receipt');
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
    stopVoice(); finalized = ''; $('transcript').value = ''; state.analysis = null; updateCheckout();
    try { recognition.start(); $('mic-status').textContent = 'Waiting for microphone permission…'; } catch { notice('Microphone is already starting. Please try again in a moment.'); }
  });
}
const VOICE_PACE = .88; // Speaking speed for the calming guide: 1 is normal, lower is slower.
// Prefer neural voices (Edge "Natural", Chrome "Google") over the robotic Windows desktop voices.
function bestVoice() {
  const voices = (window.speechSynthesis?.getVoices() || []).filter(voice => /^en(-|_|$)/i.test(voice.lang));
  const ranked = [/(Ava|Emma|Jenny|Aria|Michelle).*Natural/i, /Natural/i, /Google US English/i, /Samantha|Karen|Moira/i, /Google/i, /Online/i];
  for (const pattern of ranked) { const match = voices.find(voice => pattern.test(voice.name)); if (match) return match; }
  return voices.find(voice => voice.lang === 'en-US') || voices[0] || null;
}
window.speechSynthesis?.getVoices(); // Voices load asynchronously; this starts the load early.
function voiceIdle() { $('voice-button').querySelector('span').textContent = 'Listen to calming audio guide'; state.speech = null; }
function stopVoice() { window.speechSynthesis?.cancel(); if (state.speech instanceof Audio) { state.speech.pause(); URL.revokeObjectURL(state.speech.src); } voiceIdle(); }
$('voice-button').addEventListener('click', async () => {
  if (state.speech || window.speechSynthesis?.speaking) { stopVoice(); return; }
  stopMic(); $('voice-button').disabled = true;
  try {
    const { script } = await api('/api/voice/intervention', { analysis: state.analysis || { flags: {}, score: 50 } });
    state.script = typeof script?.text === 'string' ? script.text : '';
  } catch { state.script = ''; }
  const text = state.script || "Hi, it's okay. Your money is safe. Nothing has been sent. There's no rush. Let's take a slow breath together. Emily is on her way to help.";
  // 1. Natural AI voice from the server (ElevenLabs), when configured.
  try {
    const response = await fetch('/api/voice/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(15000) });
    if (response.status === 200) {
      const audio = new Audio(URL.createObjectURL(await response.blob()));
      // Slowed on playback (pitch preserved) so changing the pace never costs new ElevenLabs credits.
      audio.preservesPitch = true; audio.defaultPlaybackRate = audio.playbackRate = VOICE_PACE;
      state.speech = audio; audio.onended = () => { URL.revokeObjectURL(audio.src); voiceIdle(); };
      $('voice-button').disabled = false; $('voice-button').querySelector('span').textContent = 'Stop calming audio';
      await audio.play(); return;
    }
  } catch { /* Fall through to the browser voice. */ }
  // 2. Best voice the browser offers.
  if (!('speechSynthesis' in window)) { $('voice-button').disabled = false; voiceIdle(); notice('Audio is unavailable in this browser. The guidance is written above.'); return; }
  const speech = new SpeechSynthesisUtterance(text);
  const voice = bestVoice(); if (voice) speech.voice = voice;
  speech.lang = voice?.lang || 'en-US'; speech.rate = VOICE_PACE * .9; speech.pitch = 1.02; state.speech = speech;
  speech.onend = voiceIdle; speech.onerror = event => { voiceIdle(); if (!['canceled', 'interrupted'].includes(event.error)) notice('Audio could not play. Please read the guidance above.'); };
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
    if (saved) { $('wire-lock').checked = saved.wire !== false; $('gift-lock').checked = saved.gift !== false; $('money-check').checked = saved.moneyCheck === true; if (Number.isFinite(saved.limit) && saved.limit >= 0 && saved.limit <= 1000000) $('transfer-limit').value = saved.limit; $('contact-phone').value = typeof saved.phone === 'string' ? saved.phone : ''; }
    const session = JSON.parse(sessionStorage.getItem('sentio-session-v2'));
    if (session && Array.isArray(session.entries)) { for (const key of ['transaction', 'analysis', 'locked', 'completed', 'authId', 'receipt', 'incidentId', 'entries', 'script', 'demoScenario', 'dispatch', 'incidentBio', 'selectedMode', 'channel']) if (key in session) state[key] = session[key]; }
  } catch { /* Storage can be disabled; the current session remains usable. */ }
  // An unlocked prior analysis is stale after navigation. Require a fresh check.
  if (!state.locked && state.receipt?.decision !== 'APPROVE') state.analysis = null;
  $('demo-mode').value = ['calm','elevated','panic'].includes(state.selectedMode) ? state.selectedMode : '';
  setChannel(state.channel); renderIntervention(); renderAudit(); setBusy(false);
  if (state.locked) {
    $('review-status').textContent = state.receipt ? `Saved ${state.receipt.decision} receipt · ${state.authId}` : `Pending review ${state.authId || 'not yet connected'}. Payment remains locked.`;
    if (state.authId && !state.receipt) {
      try { const { escalation } = await api(`/api/caregiver/status/${encodeURIComponent(state.authId)}`); if (['BLOCKED_BY_CAREGIVER', 'CLEARED_BY_CAREGIVER'].includes(escalation.status)) { state.locked = escalation.status === 'BLOCKED_BY_CAREGIVER'; state.receipt = { decision: state.locked ? 'VETO' : 'APPROVE', authId: state.authId, time: escalation.resolvedAt }; const entry = state.entries.find(item => item.incident_id === state.incidentId); if (entry) entry.receipt = state.receipt; saveSession(); } }
      catch { state.authId = null; $('review-status').textContent = 'Previous review is unavailable. Retry family review; payment stays locked.'; }
      renderIntervention(); setBusy(false);
    }
  }
  watchReview();
  await Promise.allSettled([poll(), refreshAudit()]);
}
window.addEventListener('pagehide', () => { stopCamera(); clearTimeout(state.timer); stopMic(); stopVoice(); });
window.addEventListener('pageshow', event => { if (event.persisted) { clearTimeout(state.timer); poll(); } });
// Expression check-in runs locally: no frames or pixel data leave this page.
// Heart-rate sensing is intentionally not shown; it is a planned addition once a real sensor is connected.
const optical = { stream: null, frame: null, generation: 0, pending: false, busy: false, lastRun: 0, distress: null, label: null, seenAt: 0, modelsReady: null };
const MOODS = [
  { min: .62, level: 'scared', label: 'Scared' },
  { min: .4, level: 'worried', label: 'Worried' },
  { min: .22, level: 'uneasy', label: 'Uneasy' },
  { min: 0, level: 'calm', label: 'Calm' }
];
function moodFor(distress) { return MOODS.find(mood => distress >= mood.min); }
function opticalAvailable() { return optical.distress !== null && performance.now() - optical.seenAt < 2500 && !!optical.stream; }
// Simulated stress maps onto the same scale so the indicator still means something with the camera off.
function simulatedMood(bio) { return moodFor(Math.max(0, Math.min(1, (bio.stressIndex - 15) / 85))); }
function faceStress() { return Math.round(15 + optical.distress * 85); }
function currentMood(bio) {
  if (opticalAvailable()) return { ...optical.label, source: 'live' };
  return bio ? { ...simulatedMood(bio), source: 'simulated' } : null;
}
function currentBiometrics() {
  if (!state.bio) return null;
  const bio = { ...state.bio, expression: currentMood(state.bio)?.label };
  // A frightened face raises stress; a calm face never lowers a scenario's simulated stress.
  if (opticalAvailable()) {
    bio.stressIndex = state.demoScenario ? Math.max(state.bio.stressIndex, faceStress()) : faceStress();
    bio.expressionSource = 'camera';
  } else bio.expressionSource = 'simulated';
  // A connected heart monitor (real Bluetooth device or the labeled demo monitor) supplies the pulse.
  if (heartLive()) { bio.heartRate = heartBpm(); bio.heartSource = heartSourceLabel(); }
  return bio;
}

// Heart monitor proof of concept: the standard Bluetooth Heart Rate service (0x180D), or a demo monitor.
const heart = { device: null, bpm: null, at: 0, demo: false, name: '' };
function heartLive() { return heart.demo ? !!state.bio : heart.bpm !== null && performance.now() - heart.at < 5000; }
function heartBpm() { return heart.demo ? Math.round(state.bio.heartRate) : heart.bpm; }
function heartSourceLabel() { return heart.demo ? 'demo monitor' : heart.name || 'Bluetooth monitor'; }
function renderHeart() {
  const live = heartLive(), bpm = live ? heartBpm() : null;
  $('hr-readout').hidden = !live;
  $('hr-bpm').textContent = bpm ?? '—';
  $('hr-source').textContent = live ? (heart.demo ? 'Demo monitor · simulated' : `${heart.name || 'Bluetooth monitor'} · live`) : '';
  $('hr-heart').style.animationDuration = bpm ? `${(60 / bpm).toFixed(2)}s` : '';
  $('hr-readout').classList.toggle('racing', !!bpm && bpm >= 95);
  $('family-hr').textContent = live ? `${bpm} bpm` : heart.device ? 'Connecting…' : 'Not connected';
  $('family-hr').classList.toggle('racing', !!bpm && bpm >= 95);
  $('hr-demo').textContent = heart.demo ? 'Stop demo monitor' : 'Use demo monitor';
  $('hr-demo').setAttribute('aria-pressed', String(heart.demo));
  $('hr-connect').textContent = heart.device ? 'Disconnect' : 'Connect Bluetooth';
  if (!heart.device && !heart.demo) $('hr-status').textContent = navigator.bluetooth ? 'Not connected' : 'Bluetooth is not available in this browser · Demo monitor still works';
}
function disconnectHeart(message = 'Monitor disconnected') {
  const device = heart.device; heart.device = null; heart.bpm = null;
  try { device?.gatt?.connected && device.gatt.disconnect(); } catch { /* already gone */ }
  $('hr-status').textContent = message; renderVitals();
}
$('hr-connect').addEventListener('click', async () => {
  if (heart.device) { disconnectHeart(); return; }
  if (!navigator.bluetooth) { notice('Bluetooth needs Edge or Chrome on a computer with Bluetooth. Try the demo monitor.'); return; }
  try {
    $('hr-status').textContent = 'Choose your heart-rate monitor…';
    const device = await navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }] });
    heart.device = device; heart.name = device.name || 'Bluetooth monitor'; heart.demo = false;
    device.addEventListener('gattserverdisconnected', () => disconnectHeart(`${heart.name} disconnected`));
    $('hr-status').textContent = `Connecting to ${heart.name}…`; renderVitals();
    const server = await device.gatt.connect();
    const characteristic = await (await server.getPrimaryService('heart_rate')).getCharacteristic('heart_rate_measurement');
    characteristic.addEventListener('characteristicvaluechanged', event => {
      const value = event.target.value;
      // Bit 0 of the flags byte: heart rate is 16-bit (1) or 8-bit (0).
      heart.bpm = value.getUint8(0) & 1 ? value.getUint16(1, true) : value.getUint8(1);
      heart.at = performance.now();
      $('hr-status').textContent = `Connected to ${heart.name} · live heart rate`;
      renderVitals();
    });
    await characteristic.startNotifications();
    $('hr-status').textContent = `Connected to ${heart.name} · waiting for a reading`;
  } catch (error) {
    if (heart.device) disconnectHeart();
    $('hr-status').textContent = error?.name === 'NotFoundError' ? 'No monitor chosen · Try the demo monitor' : 'Could not connect · Make sure the monitor is on and broadcasting';
    renderVitals();
  }
});
$('hr-demo').addEventListener('click', () => {
  if (heart.device) disconnectHeart();
  heart.demo = !heart.demo;
  $('hr-status').textContent = heart.demo ? 'Demo monitor on · Simulated readings that follow the scenario' : 'Not connected';
  renderVitals();
});
function loadFaceModels() {
  if (optical.modelsReady) return optical.modelsReady;
  optical.modelsReady = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/vendor/face-api/face-api.js';
    script.onload = resolve; script.onerror = () => reject(new Error('Expression model unavailable'));
    document.head.append(script);
  }).then(() => Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri('/vendor/face-models'),
    faceapi.nets.faceExpressionNet.loadFromUri('/vendor/face-models')
  ])).catch(error => { optical.modelsReady = null; throw error; });
  return optical.modelsReady;
}
function clearOpticalSignal() { optical.distress = null; optical.label = null; }
function stopCamera(message = 'Camera off · Using simulated stress') {
  optical.generation++; optical.pending = false;
  if (optical.frame !== null) cancelAnimationFrame(optical.frame);
  const stream = optical.stream; optical.stream = null;
  stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
  $('camera-video').srcObject = null; clearOpticalSignal();
  $('camera-stage').hidden = $('mood-meter-wrap').hidden = true;
  $('camera-button').textContent = 'Enable camera'; $('camera-button').setAttribute('aria-pressed','false');
  $('optical-status').textContent = message; renderVitals();
}
function drawFaceBox(box, width, height) {
  const canvas = $('face-reticle');
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  ctx.clearRect(0,0,width,height);
  if (!box) return;
  const colors = { calm: '#99e3c4', uneasy: '#f8fafc', worried: '#f59e0b', scared: '#f43f5e' };
  ctx.strokeStyle = colors[optical.label?.level] || '#f8fafc'; ctx.lineWidth = Math.max(2,width/220);
  // The preview is mirrored with CSS, so mirror the box to match.
  const x = width - box.x - box.width, r = Math.min(box.width, box.height) * .18;
  ctx.beginPath(); ctx.roundRect(x, box.y, box.width, box.height, r); ctx.stroke();
}
function renderMoodMeter() {
  const live = opticalAvailable();
  const percent = live ? Math.round(optical.distress * 100) : 0;
  $('mood-meter-fill').style.width = `${Math.max(4, percent)}%`;
  $('mood-meter-fill').dataset.level = live ? optical.label.level : 'calm';
  $('mood-meter-value').textContent = live ? `${optical.label.label} · ${percent}%` : 'Looking for your face';
  document.querySelector('.mood-meter').setAttribute('aria-valuenow', String(percent));
}
async function cameraFrame(time) {
  if (!optical.stream) return;
  optical.frame = requestAnimationFrame(cameraFrame);
  if (optical.busy || time - optical.lastRun < 200) return;
  const video = $('camera-video');
  if (video.readyState < 2 || !video.videoWidth) return;
  optical.busy = true; optical.lastRun = time;
  const generation = optical.generation;
  try {
    const result = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: .5 })).withFaceExpressions();
    if (generation !== optical.generation || !optical.stream) return;
    const width = video.videoWidth, height = video.videoHeight;
    $('camera-stage').style.aspectRatio = `${width}/${height}`;
    if (result) {
      const e = result.expressions;
      // Fear dominates; sadness, surprise and anger read as worry. Happiness pulls the reading down.
      const raw = Math.max(0, Math.min(1, e.fearful + e.sad * .8 + e.surprised * .6 + e.angry * .6 + e.disgusted * .4 - e.happy * .3));
      optical.distress = optical.distress === null ? raw : optical.distress * .6 + raw * .4;
      optical.label = moodFor(optical.distress); optical.seenAt = performance.now();
      drawFaceBox(result.detection.box, width, height);
      $('optical-status').textContent = `Reading your expression · ${optical.label.label}`;
    } else {
      drawFaceBox(null, width, height);
      if (!opticalAvailable()) { clearOpticalSignal(); $('optical-status').textContent = 'Looking for your face · Face the screen in good light'; }
    }
    renderMoodMeter(); renderVitals();
  } catch { /* A dropped frame is harmless; the next one retries. */ }
  finally { optical.busy = false; }
}
$('camera-button').addEventListener('click', async () => {
  if (optical.stream || optical.pending) { stopCamera(); return; }
  if (!navigator.mediaDevices?.getUserMedia) { stopCamera('Camera unavailable in this browser · Using simulated stress'); return; }
  const generation = ++optical.generation; optical.pending = true;
  $('camera-button').textContent = 'Cancel camera'; $('optical-status').textContent = 'Waiting for camera permission · Using simulated stress';
  try {
    const [stream] = await Promise.all([
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false }),
      loadFaceModels()
    ]);
    if (generation !== optical.generation) { stream.getTracks().forEach(track=>track.stop()); return; }
    optical.pending = false; optical.stream = stream;
    stream.getVideoTracks().forEach(track => { track.onended = () => stopCamera('Camera disconnected · Using simulated stress'); });
    $('camera-video').srcObject = stream;
    await $('camera-video').play();
    if (generation !== optical.generation) return;
    $('camera-stage').hidden = $('mood-meter-wrap').hidden = false;
    $('camera-button').textContent = 'Turn camera off'; $('camera-button').setAttribute('aria-pressed','true');
    $('optical-status').textContent = 'Looking for your face · Face the screen in good light';
    renderMoodMeter();
    optical.frame = requestAnimationFrame(cameraFrame);
  } catch (error) { if (generation === optical.generation) stopCamera(error?.message === 'Expression model unavailable' ? 'Expression model could not load · Using simulated stress' : 'Camera unavailable or permission declined · Using simulated stress'); }
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
  const expression = state.dispatch?.expression ?? state.incidentBio?.expression;
  $('dispatch-message').textContent = hasPayment ? `URGENT: ${money(state.transaction.amount)} payment to “${state.transaction.recipient}” needs your review. ${state.analysis.coercionDetected ? 'Coercion signals detected. ' : 'A protection rule was triggered. '}${expression && expression !== 'Calm' ? `Granddad looks ${expression.toLowerCase()}. ` : ''}The demo payment is paused until you decide.` : 'When a payment needs a second look, your family alert will appear here.';
  if (state.receipt) $('dispatch-message').textContent = state.receipt.decision === 'VETO' ? `${money(state.transaction.amount)} to “${state.transaction.recipient}”: permanently blocked in this demo. Your veto is confirmed.` : `${money(state.transaction.amount)} to “${state.transaction.recipient}”: approved by you. The demo hold is cleared.`;
  const date = new Date(state.dispatch?.time || state.receipt?.time || Date.now());
  $('dispatch-time').textContent = hasPayment ? `Today ${date.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}` : 'Your family’s safety line';
  $('dispatch-receipt').textContent = state.receipt ? `${state.receipt.decision === 'VETO' ? 'Permanently blocked' : 'Approved · Hold cleared'} · ${state.receipt.authId}` : state.authId ? `Demo alert ready · ${state.authId}` : hasPayment ? 'Connecting family review…' : 'Standing by · No real SMS';
  $('dispatch-veto').disabled = !state.authId || !!state.receipt || state.busy;
  $('dispatch-call').disabled = !hasPayment || state.busy;
  $('dispatch-approve').disabled = !state.authId || !!state.receipt || state.busy;
}
$('dispatch-veto').addEventListener('click', () => decision('VETO'));
$('dispatch-call').addEventListener('click', () => { $('call-simulation').hidden = false; $('end-call').focus(); });
$('end-call').addEventListener('click', () => { $('call-simulation').hidden = true; $('dispatch-call').focus(); });

initialize();
