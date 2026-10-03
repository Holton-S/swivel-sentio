import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const pure=source.slice(source.indexOf('function estimateOpticalPulse('),source.indexOf('function clearOpticalSignal('));
const context=vm.createContext({});vm.runInContext(pure,context);
const signal=(bpm,offset=120,amplitude=.5)=>Array.from({length:301},(_,i)=>({time:i*1000/15,green:offset+amplitude*Math.sin(2*Math.PI*bpm/60*i/15)}));
for(const bpm of [54,72,90,118,150]){const value=context.estimateOpticalPulse(signal(bpm));assert.ok(value && Math.abs(value.bpm-bpm)<=2,`${bpm} bpm recovery`);}
assert.equal(context.estimateOpticalPulse(signal(72,120,0)),null,'Flat signal rejected');
assert.equal(context.estimateOpticalPulse(signal(72,12)),null,'Dark signal rejected');
assert.equal(context.estimateOpticalPulse(signal(72,250)),null,'Overexposure rejected');
assert.equal(context.estimateOpticalPulse(signal(72).slice(0,100)),null,'Short window rejected');
assert.equal(context.estimateOpticalPulse(signal(72,120,10)),null,'Large illumination fluctuations rejected');
const gap=signal(72).map((s,i)=>({...s,time:s.time+(i>=150?1000:0)}));
assert.equal(context.estimateOpticalPulse(gap),null,'Dropped-frame gap rejected');
let seed=123;const noise=signal(72).map(s=>({...s,green:120+(((seed=(seed*16807)%2147483647)/2147483647)-.5)}));
assert.equal(context.estimateOpticalPulse(noise),null,'Broadband noise rejected');
console.log('12/12 optical estimator checks passed. Synthetic signal tests do not validate medical accuracy.');
