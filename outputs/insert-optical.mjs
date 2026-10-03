import { readFileSync,writeFileSync } from 'node:fs';
const target = new URL('../public/app.js',import.meta.url);
const content=readFileSync(target,'utf8');
writeFileSync(target,content.replace('// CAMERA_AND_DISPATCH_INSERT',readFileSync(new URL('./optical-and-dispatch.js',import.meta.url),'utf8')));
