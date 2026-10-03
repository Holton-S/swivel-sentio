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
  try { await api('/api/biometrics/mode',{mode}); if (!state.locked) state.analysis = null; state.demoScenario = true; await getVitals(); $('analysis-result').textContent = `${mode[0].toUpperCase()+mode.slice(1)} vitals simulated. Check a transcript to combine speech and stress signals.`; saveSession(); }
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
