import {readFileSync,writeFileSync} from 'node:fs';
const file=new URL('../public/index.css',import.meta.url);let css=readFileSync(file,'utf8');
css=css.replaceAll('#family:has(#review-card:not([hidden])) .checkout:has(#checkout-button:disabled)','body:has(#intervention:not([hidden])) #family .checkout');
css+=`\n/* Success is soft; a held or vetoed payment always keeps the critical rose edge. */
body:has(#intervention[hidden]) #review-card { border-color: color-mix(in srgb, var(--green) 45%, var(--bg)); }
body:has(#intervention[hidden]) #review-card .badge { color: var(--mint); background: color-mix(in srgb, var(--green) 11%, var(--bg)); border-color: var(--green); }
@keyframes organic-success { from { box-shadow: 0 0 0 0 color-mix(in srgb, var(--green) 18%, transparent); } to { box-shadow: 0 0 0 6px color-mix(in srgb, var(--green) 0%, transparent); } }
@media (prefers-reduced-motion: no-preference) { .settings-status, body:has(#intervention[hidden]) #review-card .badge { animation: organic-success .7s ease-out; } }
@media (prefers-reduced-motion: reduce) { .settings-status, body:has(#intervention[hidden]) #review-card .badge { animation: none !important; } }
`;
writeFileSync(file,css);
const colors=[...new Set(css.match(/#[\da-f]{3,8}\b/gi))];console.log('CSS base colors:',colors);
const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255);const mix=(a,b,p)=>a.map((x,i)=>p*x+(1-p)*b[i]);const lum=c=>c.map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((a,x,i)=>a+x*[.2126,.7152,.0722][i],0);const ratio=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);const bg=rgb('#090d16'),white=rgb('#f8fafc'),green=rgb('#10b981'),rose=rgb('#f43f5e');
console.log(JSON.stringify({mutedOnBrightestPanel:ratio(mix(white,bg,.7),mix(green,bg,.13)),interventionBody:ratio(mix(bg,white,.83),white),interventionLabel:ratio(mix(rose,bg,.55),white),dangerButton:ratio(white,mix(rose,bg,.52)),dangerHover:ratio(white,mix(rose,bg,.63))},null,2));
