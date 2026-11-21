import fs from 'node:fs';import path from 'node:path';
const root=process.cwd();
const bad=[/google-analytics/i,/gtag\s*\(/i,/sentry/i,/localStorage\s*[.=\[]/i,/indexedDB\s*[.(]/i,/walletconnect/i];
const files=[];function walk(d){for(const f of fs.readdirSync(d)){const p=path.join(d,f);if(p.includes('node_modules')||p.includes('dist'))continue;const s=fs.statSync(p);if(s.isDirectory())walk(p);else if(/\.(ts|js|html)$/.test(p)&&!p.endsWith('privacy-check.mjs'))files.push(p)}}walk(path.join(root,'src'));files.push(path.join(root,'index.html'));
let fail=false;for(const f of files){const t=fs.readFileSync(f,'utf8');for(const re of bad){if(re.test(t)){console.error('privacy check hit',re,f);fail=true}}}if(fail)process.exit(1);console.log('privacy checks passed:',files.length,'runtime files scanned');
