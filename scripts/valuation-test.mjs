import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const script=readFileSync(new URL('../valuation.js',import.meta.url),'utf8');
const beg=script.indexOf('function decimalParts('),end=script.indexOf('const priceKey=',beg);
assert.ok(beg>=0&&end>beg,'decimal utilities present');
const precision=vm.runInNewContext(script.slice(beg,end)+';({centsOf,centsString})');
for(const [amount,price,expected] of [
 ['0.1','0.2','0.02'],
 ['1.005','1','1.01'],
 ['0.00000001','100000000','1.00'],
 ['35060.6000463','1','35060.60'],
 ['999999999999.99999999','0.01','10000000000.00']
])assert.equal(precision.centsString(precision.centsOf(amount,price)),expected);
const workerCode=readFileSync(new URL('../valuation-worker.js',import.meta.url),'utf8');
const events=[],self={postMessage:m=>events.push(m)};
const context={self,TextDecoder,Blob,setTimeout,BigInt,Date,Number,Math,Uint8Array,String,Array,Object,RegExp,Error};
vm.runInNewContext(workerCode,context,{filename:'valuation-worker.js'});
const csv='datetime_jst,asset,amount,notes\r\n2025/01/01 00:00,BTC,0.1,"Hello\r\nWorld"\r\n2025/02/02 03:04,ETH,0.0000000000000000001,"said ""yes"""\r\n';
await self.onmessage({data:{type:'import',file:new Blob([csv]),id:'rows'}});
const rows=events.filter(m=>m.type==='batch').flatMap(m=>m.rows);
assert.equal(rows.length,2);
assert.equal(rows[0].notes,'Hello\r\nWorld');
assert.equal(rows[1].notes,'said "yes"');
assert.equal(rows[1].amount,'0.0000000000000000001');
assert.equal(events.at(-1).type,'done');
console.log('Valuation worker and BigInt decimal tests passed');
