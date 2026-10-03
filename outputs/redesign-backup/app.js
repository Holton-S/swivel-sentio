/**
 * app.js - Client Controller for Swivel Sentio Multimodal Defense Pipeline
 */

// State
const state = {
  elderlyMode: false,
  bioMode: 'calm',
  currentBio: { heartRate: 72, stressIndex: 18, respiratoryRate: 16, hrv: 54 },
  lastAnalysis: null,
  activeEscalation: null,
  isListening: false,
  recognition: null,
  waveOffset: 0
};

// Preset attack vectors
const PRESETS = {
  irs: "This is Officer Miller from the Internal Revenue Service IRS. You owe back taxes. Wire transfer the penalty immediately within 30 minutes or the local sheriff will issue an arrest warrant and you will go to jail. Do not hang up.",
  grandson: "Grandma, it's your grandson! I was in a terrible car accident and I'm at the hospital. Please don't tell mom and dad, but I need you to send a $3,000 wire transfer right now for the emergency surgery before it's too late.",
  geeksquad: "Hello sir, this is Geek Squad tech support. We noticed a charge on your account. To cancel it, go to Target and buy Apple gift cards, then read the numbers to me. Keep this confidential between you and me.",
  utility: "Payment for City Public Service Energy electric bill for the month of September. Thank you for using online bill pay."
};

// DOM Elements
const el = {
  btnToggleElderly: document.getElementById('btn-toggle-elderly'),
  btnRunQA: document.getElementById('btn-run-qa'),
  ppgCanvas: document.getElementById('ppgCanvas'),
  valHeartRate: document.getElementById('val-heartRate'),
  valStressIndex: document.getElementById('val-stressIndex'),
  valRespiratoryRate: document.getElementById('val-respiratoryRate'),
  valHrv: document.getElementById('val-hrv'),
  barHeartRate: document.getElementById('bar-heartRate'),
  barStressIndex: document.getElementById('bar-stressIndex'),
  barRespiratoryRate: document.getElementById('bar-respiratoryRate'),
  barHrv: document.getElementById('bar-hrv'),
  bioModeBadge: document.getElementById('bio-mode-badge'),
  bioButtons: document.querySelectorAll('[data-bio-mode]'),
  presetButtons: document.querySelectorAll('[data-preset]'),
  transcriptInput: document.getElementById('transcript-input'),
  btnRunDetect: document.getElementById('btn-run-detect'),
  btnToggleMic: document.getElementById('btn-toggle-mic'),
  micBtnText: document.getElementById('mic-btn-text'),
  micStatus: document.getElementById('mic-status'),
  analysisLatency: document.getElementById('analysis-latency'),
  riskPill: document.getElementById('risk-pill'),
  indicatorTags: document.getElementById('indicator-tags'),
  safetyLockBanner: document.getElementById('safety-lock-banner'),
  btnRequestCaregiver: document.getElementById('btn-request-caregiver'),
  chkAmount: document.getElementById('chk-amount'),
  chkRecipient: document.getElementById('chk-recipient'),
  chkRail: document.getElementById('chk-rail'),
  btnSubmitPayment: document.getElementById('btn-submit-payment'),
  checkoutVerdict: document.getElementById('checkout-verdict'),
  voiceSpeaker: document.getElementById('voice-speaker'),
  voiceTranscript: document.getElementById('voice-transcript'),
  btnPlayVoice: document.getElementById('btn-play-voice'),
  caregiverStatusPill: document.getElementById('caregiver-status-pill'),
  smsLog: document.getElementById('sms-log'),
  caregiverActionControls: document.getElementById('caregiver-action-controls'),
  btnCaregiverVeto: document.getElementById('btn-caregiver-veto'),
  btnCaregiverApprove: document.getElementById('btn-caregiver-approve'),
  tigerTotalSamples: document.getElementById('tiger-total-samples'),
  tigerTotalIncidents: document.getElementById('tiger-total-incidents'),
  btnRefreshTiger: document.getElementById('btn-refresh-tiger'),
  qaOverallPill: document.getElementById('qa-overall-pill'),
  qaBenchLatency: document.getElementById('qa-bench-latency'),
  qaBenchThroughput: document.getElementById('qa-bench-throughput'),
  qaTestList: document.getElementById('qa-test-list')
};

// Canvas Setup
const ctx = el.ppgCanvas.getContext('2d');

function drawPPGWaveform() {
  const width = el.ppgCanvas.width;
  const height = el.ppgCanvas.height;
  ctx.clearRect(0, 0, width, height);

  // Background subtle grid
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x < width; x += 40) {
    ctx.moveTo(x, 0); ctx.lineTo(x, height);
  }
  for (let y = 0; y < height; y += 25) {
    ctx.moveTo(0, y); ctx.lineTo(width, y);
  }
  ctx.stroke();

  // Waveform line
  const hr = state.currentBio.heartRate;
  const stress = state.currentBio.stressIndex;
  const waveFreq = hr / 60 * 2.5;

  ctx.beginPath();
  ctx.lineWidth = 2.5;
  const isStress = stress > 65;
  ctx.strokeStyle = isStress ? '#ef4444' : '#00f0ff';
  ctx.shadowColor = isStress ? 'rgba(239, 68, 68, 0.8)' : 'rgba(0, 240, 255, 0.6)';
  ctx.shadowBlur = 8;

  state.waveOffset += 0.08 * waveFreq;

  for (let x = 0; x < width; x++) {
    const t = (x * 0.03) + state.waveOffset;
    // Photoplethysmogram dicrotic notch pulse shape
    const mainWave = Math.sin(t);
    const dicrotic = Math.sin(t * 2 + 0.4) * 0.4;
    const y = (height / 2) + (mainWave + dicrotic) * (20 + (stress * 0.15));
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  requestAnimationFrame(drawPPGWaveform);
}

// Fetch Biometrics Stream
async function fetchBiometrics() {
  try {
    const res = await fetch('/api/biometrics');
    const data = await res.json();
    if (data.success) {
      state.currentBio = data.telemetry;
      updateBioUI(data.telemetry);
    }
  } catch (err) {
    console.warn('Biometrics polling:', err.message);
  }
}

function updateBioUI(bio) {
  el.valHeartRate.innerText = bio.heartRate;
  el.valStressIndex.innerText = bio.stressIndex;
  el.valRespiratoryRate.innerText = bio.respiratoryRate;
  el.valHrv.innerText = bio.hrv || 54;

  el.barHeartRate.style.width = `${Math.min(100, (bio.heartRate / 140) * 100)}%`;
  el.barStressIndex.style.width = `${bio.stressIndex}%`;
  el.barRespiratoryRate.style.width = `${Math.min(100, (bio.respiratoryRate / 30) * 100)}%`;
  el.barHrv.style.width = `${Math.min(100, (bio.hrv / 80) * 100)}%`;

  if (bio.stressIndex > 70) {
    el.valStressIndex.style.color = '#ef4444';
    el.barStressIndex.style.background = '#ef4444';
  } else if (bio.stressIndex > 40) {
    el.valStressIndex.style.color = '#f59e0b';
    el.barStressIndex.style.background = '#f59e0b';
  } else {
    el.valStressIndex.style.color = '#f8fafc';
    el.barStressIndex.style.background = '#00f0ff';
  }
}

// Set Biometric Simulator Mode
async function setBioMode(mode) {
  state.bioMode = mode;
  el.bioButtons.forEach(b => {
    b.classList.toggle('active', b.dataset.bioMode === mode);
  });
  el.bioModeBadge.className = `status-pill status-${mode}`;
  el.bioModeBadge.innerText = mode.toUpperCase();

  try {
    await fetch('/api/biometrics/mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode })
    });
    fetchBiometrics();
  } catch (err) {
    console.error('Mode change error:', err);
  }
}

// Speech Recognition Init
function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    el.micStatus.innerText = 'Mic API unavailable in this browser';
    el.btnToggleMic.disabled = true;
    return;
  }

  const recog = new SpeechRecognition();
  recog.continuous = true;
  recog.interimResults = true;
  recog.lang = 'en-US';

  recog.onstart = () => {
    state.isListening = true;
    el.micStatus.innerText = 'Listening live...';
    el.btnToggleMic.classList.add('btn-danger');
    el.micBtnText.innerText = 'Stop Mic Capture';
  };

  recog.onresult = (evt) => {
    let transcript = '';
    for (let i = 0; i < evt.results.length; i++) {
      transcript += evt.results[i][0].transcript + ' ';
    }
    el.transcriptInput.value = transcript;
    runDetection();
  };

  recog.onend = () => {
    state.isListening = false;
    el.micStatus.innerText = 'Mic Idle';
    el.btnToggleMic.classList.remove('btn-danger');
    el.micBtnText.innerText = 'Start Mic Capture';
  };

  recog.onerror = (err) => {
    console.warn('Speech error:', err);
    el.micStatus.innerText = `Mic error: ${err.error}`;
  };

  state.recognition = recog;
}

function toggleMic() {
  if (!state.recognition) return;
  if (state.isListening) {
    state.recognition.stop();
  } else {
    state.recognition.start();
  }
}

// Run Multimodal Coercion Detection
async function runDetection() {
  const text = el.transcriptInput.value.trim();
  if (!text) return;

  try {
    const res = await fetch('/api/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript: text,
        biometrics: state.currentBio,
        transaction: {
          amount: parseFloat(el.chkAmount.value) || 2500,
          recipient: el.chkRecipient.value
        }
      })
    });
    const data = await res.json();
    if (!data.success) return;

    state.lastAnalysis = data.analysis;
    el.analysisLatency.innerText = `${data.latencyMs}ms`;

    updateRiskUI(data.analysis);
    updateCheckoutUI(data.analysis);
    fetchTigerRollup();

    // If critical or high coercion detected, trigger voice intervention & safety pause
    if (data.analysis.riskTier === 'CRITICAL' || data.analysis.riskTier === 'HIGH') {
      fetchVoiceIntervention(data.analysis);
      triggerCaregiverEscalation(data.analysis);
    }
  } catch (err) {
    console.error('Detection error:', err);
  }
}

function updateRiskUI(analysis) {
  const { score, riskTier, flags } = analysis;

  el.riskPill.className = `status-pill status-${riskTier.toLowerCase()}`;
  el.riskPill.innerText = `${riskTier} RISK: ${score}/100`;

  // Populate indicator tags
  el.indicatorTags.innerHTML = '';
  let flagCount = 0;

  for (const [cat, items] of Object.entries(flags)) {
    if (items && items.length > 0) {
      flagCount++;
      const tag = document.createElement('span');
      tag.className = `tag-badge tag-${cat}`;
      tag.innerHTML = `<strong>${cat}:</strong> ${items.join(', ')}`;
      el.indicatorTags.appendChild(tag);
    }
  }

  if (flagCount === 0) {
    el.indicatorTags.innerHTML = '<span class="tag-placeholder">No coercion patterns active</span>';
  }
}

function updateCheckoutUI(analysis) {
  const isHighRisk = analysis.riskTier === 'CRITICAL' || analysis.riskTier === 'HIGH';

  if (isHighRisk) {
    el.safetyLockBanner.classList.remove('hidden');
    el.checkoutVerdict.className = 'verdict-banner verdict-locked';
    el.checkoutVerdict.innerHTML = `
      <span class="verdict-icon">⚠️</span>
      <div>
        <strong>SAFETY PAUSE ACTIVE: Transfer Blocked</strong>
        <p>Swivel Sentio has placed a temporary protective hold on this $${el.chkAmount.value} payment due to high psychological coercion indicators.</p>
      </div>
    `;
    el.btnSubmitPayment.disabled = true;
    el.btnSubmitPayment.innerText = '🔒 Checkout Locked by Safety Guard';
  } else {
    el.safetyLockBanner.classList.add('hidden');
    el.checkoutVerdict.className = 'verdict-banner verdict-safe';
    el.checkoutVerdict.innerHTML = `
      <span class="verdict-icon">✓</span>
      <div>
        <strong>Transaction Status: NORMAL</strong>
        <p>No anomalous coercion signals detected.</p>
      </div>
    `;
    el.btnSubmitPayment.disabled = false;
    el.btnSubmitPayment.innerText = 'Proceed with Transaction';
  }
}

// ElevenLabs Voice Intervention
async function fetchVoiceIntervention(analysis) {
  try {
    const res = await fetch('/api/voice/intervention', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analysis })
    });
    const data = await res.json();
    if (data.success) {
      el.voiceSpeaker.innerText = data.script.speakerName;
      el.voiceTranscript.innerText = `"${data.script.text}"`;
      speakIntervention(data.script.text);
    }
  } catch (err) {
    console.error('Voice intervention error:', err);
  }
}

function speakIntervention(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.92;
  utterance.pitch = 1.0;
  // Pick warm natural voice if available
  const voices = window.speechSynthesis.getVoices();
  const naturalVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Female') || v.name.includes('Samantha') || v.name.includes('Google') || v.name.includes('Natural')));
  if (naturalVoice) utterance.voice = naturalVoice;

  window.speechSynthesis.speak(utterance);
}

// Caregiver Escalation Protocol
async function triggerCaregiverEscalation(analysis) {
  try {
    const res = await fetch('/api/caregiver/escalate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transaction: {
          amount: parseFloat(el.chkAmount.value) || 2500,
          recipient: el.chkRecipient.value
        },
        analysis,
        biometrics: state.currentBio
      })
    });
    const data = await res.json();
    if (data.success) {
      state.activeEscalation = data.escalation;
      el.caregiverStatusPill.className = 'status-pill status-panic';
      el.caregiverStatusPill.innerText = 'VERIFICATION REQUIRED';

      // Log outbound SMS to terminal
      addSmsLog('sms-outbound', data.escalation.smsPayload.message, 'OUTBOUND SMS');
      el.caregiverActionControls.style.display = 'block';
    }
  } catch (err) {
    console.error('Caregiver escalation error:', err);
  }
}

async function resolveCaregiverDecision(decision) {
  if (!state.activeEscalation) return;

  try {
    const res = await fetch('/api/caregiver/decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authId: state.activeEscalation.authId,
        decision
      })
    });
    const data = await res.json();
    if (data.success) {
      const isVeto = decision === 'VETO';
      addSmsLog('sms-inbound', `Caregiver Emily Souquette responded: ${decision} (${data.result.status})`, 'INBOUND SMS');
      el.caregiverActionControls.style.display = 'none';

      if (isVeto) {
        el.caregiverStatusPill.className = 'status-pill status-critical';
        el.caregiverStatusPill.innerText = 'VETOED & BLOCKED';
        el.checkoutVerdict.innerHTML = `
          <span class="verdict-icon">🚫</span>
          <div>
            <strong>TRANSACTION VETOED BY CAREGIVER</strong>
            <p>Daughter Emily Souquette has vetoed this transaction. High-risk funds transfer terminated permanently.</p>
          </div>
        `;
      } else {
        el.caregiverStatusPill.className = 'status-pill status-calm';
        el.caregiverStatusPill.innerText = 'APPROVED BY CAREGIVER';
        el.checkoutVerdict.className = 'verdict-banner verdict-safe';
        el.checkoutVerdict.innerHTML = `
          <span class="verdict-icon">✓</span>
          <div>
            <strong>CAREGIVER APPROVED</strong>
            <p>Family member verified authenticity and authorized release of hold.</p>
          </div>
        `;
        el.btnSubmitPayment.disabled = false;
        el.btnSubmitPayment.innerText = 'Complete Approved Payment';
      }
    }
  } catch (err) {
    console.error('Caregiver resolution error:', err);
  }
}

function addSmsLog(cls, text, tag) {
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const div = document.createElement('div');
  div.className = `sms-message ${cls}`;
  div.innerHTML = `<span class="sms-time">${tag} • ${time}</span><span class="sms-text">${text}</span>`;
  el.smsLog.appendChild(div);
  el.smsLog.scrollTop = el.smsLog.scrollHeight;
}

// Tiger Data Rollup
async function fetchTigerRollup() {
  try {
    const res = await fetch('/api/tigerdata/rollup');
    const data = await res.json();
    if (data.success) {
      el.tigerTotalIncidents.innerText = data.incidents.length;
      let totalVitals = 0;
      data.rollup.forEach(r => totalVitals += r.sample_count);
      el.tigerTotalSamples.innerText = Math.max(totalVitals, 1);
    }
  } catch (err) {
    console.warn('Tiger Data fetch:', err);
  }
}

// QA & QC System Runner
async function runQAAudit() {
  el.qaOverallPill.className = 'status-pill status-elevated';
  el.qaOverallPill.innerText = 'RUNNING AUDIT...';

  try {
    const res = await fetch('/api/qa/run');
    const data = await res.json();
    if (data.success) {
      const rep = data.report;
      const allPassed = rep.failed === 0;

      el.qaOverallPill.className = `status-pill status-${allPassed ? 'calm' : 'panic'}`;
      el.qaOverallPill.innerText = `${rep.passed}/${rep.total} PASSED (${((rep.passed/rep.total)*100).toFixed(0)}%)`;

      el.qaBenchLatency.innerText = `${rep.benchmarks.avgLatencyMs}ms`;
      el.qaBenchThroughput.innerText = `~${rep.benchmarks.throughputPerSec.toLocaleString()} req/s`;

      el.qaTestList.innerHTML = '';
      rep.details.forEach(item => {
        const div = document.createElement('div');
        div.className = `qa-item ${item.passed ? 'test-passed' : 'test-failed'}`;
        div.innerHTML = `
          <span class="qa-badge ${item.passed ? 'pass' : 'fail'}">${item.passed ? 'PASS' : 'FAIL'}</span>
          <span class="qa-name">${item.id}: ${item.name}</span>
          <span class="qa-ms">${item.latencyMs}ms</span>
        `;
        el.qaTestList.appendChild(div);
      });
    }
  } catch (err) {
    console.error('QA audit error:', err);
  }
}

// Event Listeners
function setupEventListeners() {
  // Elderly Assist Toggle
  el.btnToggleElderly.addEventListener('click', () => {
    state.elderlyMode = !state.elderlyMode;
    document.body.classList.toggle('elderly-mode', state.elderlyMode);
    el.btnToggleElderly.classList.toggle('active', state.elderlyMode);
  });

  // Biometric Mode Buttons
  el.bioButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      setBioMode(btn.dataset.bioMode);
    });
  });

  // Preset Attack Scenarios
  el.presetButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.preset;
      el.transcriptInput.value = PRESETS[key] || '';
      // If scam scenario, automatically set sensor to elevated/panic to demonstrate multimodal fusion!
      if (key === 'irs') setBioMode('panic');
      else if (key === 'grandson') setBioMode('panic');
      else if (key === 'geeksquad') setBioMode('elevated');
      else setBioMode('calm');

      runDetection();
    });
  });

  // Analysis Button
  el.btnRunDetect.addEventListener('click', runDetection);

  // Mic Toggle
  el.btnToggleMic.addEventListener('click', toggleMic);

  // Voice Intervention Play
  el.btnPlayVoice.addEventListener('click', () => {
    const text = el.voiceTranscript.innerText.replace(/"/g, '');
    speakIntervention(text);
  });

  // Caregiver Decision Buttons
  el.btnCaregiverVeto.addEventListener('click', () => resolveCaregiverDecision('VETO'));
  el.btnCaregiverApprove.addEventListener('click', () => resolveCaregiverDecision('APPROVE'));

  // Request Caregiver from banner
  el.btnRequestCaregiver.addEventListener('click', () => {
    if (state.lastAnalysis) triggerCaregiverEscalation(state.lastAnalysis);
  });

  // Refresh Tiger Data
  el.btnRefreshTiger.addEventListener('click', fetchTigerRollup);

  // QA Audit Button
  el.btnRunQA.addEventListener('click', runQAAudit);

  // Initialize Web Speech Recognition
  initSpeechRecognition();

  // Run Biometrics Poller every 1000ms
  setInterval(fetchBiometrics, 1000);
  fetchBiometrics();
  fetchTigerRollup();
}

// Kickoff
window.addEventListener('DOMContentLoaded', () => {
  drawPPGWaveform();
  setupEventListeners();
  // Run initial QA audit to populate test list
  setTimeout(runQAAudit, 300);
});
