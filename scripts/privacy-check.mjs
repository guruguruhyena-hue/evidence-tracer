import fs from 'node:fs';import path from 'node:path';
const root=process.cwd();
const bad=[/google-analytics/i,/gtag\s*\(/i,/sentry/i,/walletconnect/i];
const files=[];function walk(d){for(const f of fs.readdirSync(d)){const p=path.join(d,f);if(p.includes('node_modules')||p.includes('dist'))continue;const s=fs.statSync(p);if(s.isDirectory())walk(p);else if(/\.(ts|js|html)$/.test(p)&&!p.endsWith('privacy-check.mjs'))files.push(p)}}walk(path.join(root,'src'));files.push(path.join(root,'index.html'));files.push(path.join(root,'report.html'));files.push(path.join(root,'app.js'));files.push(path.join(root,'report.js'));files.push(path.join(root,'tx-verify.js'));files.push(path.join(root,'tx-verify.html'));files.push(path.join(root,'btc-verify.js'));files.push(path.join(root,'btc-verify.html'));
let fail=false;for(const f of files){const t=fs.readFileSync(f,'utf8');for(const re of bad){if(re.test(t)){console.error('privacy check hit',re,f);fail=true}}}if(fail)process.exit(1);console.log('privacy checks passed:',files.length,'runtime files scanned');

const caseSensitive=[/bc1qayqcwz6fy3dhtasdzqhnfpl6z32pggggakuzn6/i,/rnp2Keixnwq28wDXbgjZcQwtKBYMB15KVf/i,/At26TxgbKA18eLsm3MX9d26pti3yQm6RM6mD58qM94Kz/i,/0x373A411724F5d1D76e873075204EEb15dCFD40C8/i,/0x8fEEe00f1d8C355086b4667f153C744688b7F6b0/i,/IZAKA-YA/i];
for(const pathname of ['index.html','report.html','app.js','report.js','tx-verify.html','tx-verify.js','btc-verify.html','btc-verify.js',...files.filter(x=>x.startsWith(path.join(root,'src')))]){
 const full=path.join(root,pathname);if(!fs.existsSync(full))continue;
 const data=fs.readFileSync(full,'utf8');
 for(const re of caseSensitive){if(re.test(data)){console.error('case-specific content in public runtime',pathname,re);process.exitCode=1;}}
}
