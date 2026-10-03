import {readFileSync,writeFileSync} from 'node:fs';
const path=new URL('../public/index.html',import.meta.url);let html=readFileSync(path,'utf8');
const audit=html.match(/<section class="panel audit"[\s\S]*?<\/section>/)?.[0];
const dispatch=html.match(/<section class="dispatch"[\s\S]*?<\/section>/)?.[0];
const review=html.match(/<section id="review-card"[\s\S]*?<\/section>/)?.[0];
if(!audit||!dispatch||!review)throw Error('Missing section');
html=html.replace(audit,'').replace(dispatch,'').replace(review,'');
html=html.replace('</div><aside class="side-column">',`${audit}</div><aside class="side-column">${dispatch}${review}`);
writeFileSync(path,html);
