import {readFileSync,writeFileSync} from 'node:fs';
const target = new URL('../public/index.css',import.meta.url);
let css=readFileSync(target,'utf8');
const base = new Set(['090d16','f8fafc','10b981','f59e0b','f43f5e']);
css=css.replace(/#([\da-f]{8}|[\da-f]{6}|[\da-f]{4}|[\da-f]{3})\b/gi,(literal,hex)=>{
  hex=hex.toLowerCase(); if(hex.length<5)hex=[...hex].map(c=>c+c).join('');
  const rgb=hex.slice(0,6), alpha=hex.length===8?parseInt(hex.slice(6),16)/255:1;
  if(base.has(rgb)&&alpha===1)return '#'+rgb;
  const [r,g,b]=[0,2,4].map(i=>parseInt(rgb.slice(i,i+2),16)/255);
  const max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min,sat=max?delta/max:0;
  let hue=0;if(delta)hue=(max===r?((g-b)/delta+6)%6:max===g?(b-r)/delta+2:(r-g)/delta+4)*60;
  let color;
  if(sat>.16 && hue>=85 && hue<185){
    color=max>.73?`color-mix(in srgb, #10b981 ${Math.max(15,Math.round((1-max)*250))}%, #f8fafc)`:`color-mix(in srgb, #10b981 ${Math.max(5,Math.round(max/.73*100))}%, #090d16)`;
  } else if(sat>.2 && (hue>=330||hue<15) && max>.14){
    color=max>.95?`color-mix(in srgb, #f43f5e 55%, #f8fafc)`:`color-mix(in srgb, #f43f5e ${Math.round(max*100)}%, #090d16)`;
  } else if(sat>.18 && hue>=15&&hue<85 && max>.14){
    color=max>.75?`color-mix(in srgb, #f59e0b 50%, #f8fafc)`:`color-mix(in srgb, #f59e0b ${Math.round(max*100)}%, #090d16)`;
  } else {const percent=Math.max(0,Math.min(100,Math.round((max-.086)/.90*100)));color=percent===0?'#090d16':`color-mix(in srgb, #f8fafc ${percent}%, #090d16)`;}
  return alpha===1?color:`color-mix(in srgb, ${color} ${Math.round(alpha*100)}%, transparent)`;
});
css=css.replace(/(?<![-\w])white(?![-\w])/g,'#f8fafc');
writeFileSync(target,css);
