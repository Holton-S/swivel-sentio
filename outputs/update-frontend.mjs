import {readFileSync,writeFileSync} from 'node:fs';
const root = new URL('../public/', import.meta.url);
let html = readFileSync(new URL('index.html',root),'utf8');
function replace(a,b) { if(!html.includes(a)) throw Error('Missing HTML anchor: '+a.slice(0,50)); html=html.replace(a,b); }
replace('<footer class="guardian-footer">', `<section class="optical-panel" aria-labelledby="optical-title">
<div class="optical-heading"><div><span class="eyebrow">OPTIONAL CAMERA COMPANION</span><h2 id="optical-title">A pulse. Without a wearable.</h2></div><button id="camera-button" class="secondary" aria-pressed="false">Enable camera</button></div>
<p id="optical-status" class="optical-status" role="status">Simulated vitals · Camera off</p>
<div id="camera-stage" class="camera-stage" hidden><video id="camera-video" autoplay muted playsinline aria-label="Local camera preview; align your forehead inside the guide"></video><canvas id="face-reticle" aria-hidden="true"></canvas><div class="camera-caption">Align your forehead with the small frame</div></div>
<div id="optical-progress-wrap" class="optical-progress-wrap" hidden><label for="optical-progress">Gathering a steady signal</label><progress id="optical-progress" value="0" max="20">0 seconds</progress></div>
<p class="optical-note">Video stays on this device. Experimental pulse estimate; not a medical reading. Presage SDK is not connected.</p>
</section><footer class="guardian-footer">`);
replace('Simulated vitals · Camera sensor not connected','<span id="vitals-source">Simulated vitals · Camera off</span>');
replace('<div class="audio-lab">','<div class="mode-control"><label for="demo-mode">Simulated stress level</label><select id="demo-mode"><option value="calm">Calm</option><option value="elevated">Elevated</option><option value="panic">Panic</option></select></div><div class="audio-lab">');
replace('<div class="quiet-note">', `<section class="dispatch" aria-labelledby="dispatch-title"><div class="dispatch-heading"><span class="eyebrow">REASSURANCE, WITHIN REACH</span><h2 id="dispatch-title">Emily’s phone</h2><p>Dispatch simulator · No SMS is sent</p></div>
<div class="phone-shell"><div class="phone-hardware" aria-hidden="true"></div><div class="phone-screen"><div class="phone-status" aria-hidden="true"><span>9:41</span><span>▂▄▆ ▰</span></div><div class="phone-contact"><span class="phone-shield"><svg><use href="#shield"/></svg></span><strong>Swivel Shield</strong><small>Family protection</small></div><div class="phone-conversation"><span class="phone-timestamp" id="dispatch-time">Your family’s safety line</span><p class="message-bubble" id="dispatch-message">When a payment needs a second look, your family alert will appear here.</p><p class="phone-receipt" id="dispatch-receipt" role="status">Standing by</p><div class="phone-actions"><button id="dispatch-veto" class="danger" disabled>🚫 Veto & block funds</button><button id="dispatch-call" class="phone-call" disabled>📞 Call Granddad</button></div><div id="call-simulation" class="call-simulation" hidden><span class="avatar">G</span><strong>Granddad</strong><p>Demo call · No real call is placed</p><button id="end-call" class="danger">End demo call</button></div></div><div class="home-indicator" aria-hidden="true"></div></div></div></section><div class="quiet-note">`);
replace('<th scope="col">Signals detected</th>','<th scope="col">Rail / risk</th><th scope="col">Signals detected</th>');
replace('colspan="4"','colspan="5"');
writeFileSync(new URL('index.html',root),html);
