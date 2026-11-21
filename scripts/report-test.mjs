import assert from 'node:assert/strict';
import fs from 'node:fs';
const s=fs.readFileSync('report.js','utf8');
const start=s.indexOf("const $=id=>");
const end=s.indexOf("$('withdrawalForm').addEventListener",start);
assert.ok(start>=0&&end>start,'report functions must be present');
const core=s.slice(start,end);
const functions=new Function('document',core+'return {validatePacket,casePacket};')({getElementById(id){return {value:({caseTitle:'Sample',reporter:'',caseStatement:'test'}[id]||'')}}});
const valid={schema:'evidence-tracer-generic-evidence-report-v1',withdrawalRecords:[{date:'2026/01/01',asset:'BTC',amount:'0.01234567',status:'Pending'}],sourceFiles:[{name:'a.pdf',size:42,sha256:'a'.repeat(64)}],reconciliation:null};
assert.equal(functions.validatePacket(valid),valid);
for(const change of [{schema:'wrong'}, {withdrawalRecords:[{...valid.withdrawalRecords[0],amount:'NaN'}]},{sourceFiles:[{name:'a',size:5,sha256:'bad'}]},{reconciliation:{recordCount:'7',statusCounts:{}}}]){
 assert.throws(()=>functions.validatePacket({...valid,...change}));
}
const packet=functions.casePacket();
assert.equal(packet.schema,'evidence-tracer-generic-evidence-report-v1');
assert.equal(packet.caseTitle,'Sample');
assert.equal(packet.withdrawalRecords.length,0);
assert.equal(packet.sourceFiles.length,0);
console.log('Generic report validation and empty-case tests passed');
