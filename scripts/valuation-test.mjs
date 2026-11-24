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

const priceSource=readFileSync(new URL('../historical-price-sources.js',import.meta.url),'utf8');
const recorded=[];
const fakeFetch=async url=>{
 recorded.push(url);
 if(url.includes('frankfurter.dev'))return {ok:true,json:async()=>({rates:{'2025-01-01':{JPY:150.5},'2025-01-02':{JPY:151}}})};
 if(url.includes('/klines'))return {ok:true,json:async()=>[
  [Date.parse('2025-01-01T00:00:00Z'),'0','0','0','100000.00'],
  [Date.parse('2025-01-02T00:00:00Z'),'0','0','0','101000.00']
 ]};
 throw Error('Unexpected provider '+url);
};
const priceGlobal={};
const prices=vm.runInNewContext(priceSource+';globalThis.HistoricalPriceSources',{
 globalThis:priceGlobal,fetch:fakeFetch,AbortSignal:{timeout:()=>undefined},Date,Math,BigInt,String,Number,Map,Set,Error,Array,RegExp
}) ?? priceGlobal.HistoricalPriceSources;
assert.equal(prices.decimalProduct('0.1','0.2'),'0.02');
const sample=await prices.obtain({assets:['BTC','USDT','AKC'],dates:['2025-01-01','2025-01-02']});
assert.equal(sample.output.get('BTC|2025-01-01').price,'15050000');
assert.equal(sample.output.get('USDT|2025-01-02').price,'151');
assert.equal(sample.errors.length,1);
assert.equal(sample.output.get('BTC|2025-01-01').method,'USDT_PAIR_DAILY_CLOSE_X_USDJPY_REFERENCE');
assert.ok(recorded.some(x=>x.includes('data-api.binance.vision')));
assert.ok(recorded.some(x=>x.includes('frankfurter.dev')));
console.log('Historical price approximation and provenance tests passed');

// Per-asset summary must preserve arbitrary decimal precision.
const qtyStart=script.indexOf('function addDecimalToAccumulator(');
const qtyEnd=script.indexOf('let summaryGeneration=',qtyStart);
assert.ok(qtyStart>=0&&qtyEnd>qtyStart,'quantity summary utilities present');
const quantity=vm.runInNewContext(script.slice(beg,script.indexOf('function centsOf(',beg))+'\n'+script.slice(qtyStart,qtyEnd)+';({addDecimalToAccumulator,decimalAccumulatorString})');
let acc={value:0n,scale:0};
for(const value of ['0.1','0.2','0.00000001'])quantity.addDecimalToAccumulator(acc,value);
assert.equal(quantity.decimalAccumulatorString(acc),'0.30000001');
acc={value:0n,scale:0};
for(const value of ['1.000000000000000001','0.000000000000000002'])quantity.addDecimalToAccumulator(acc,value);
assert.equal(quantity.decimalAccumulatorString(acc),'1.000000000000000003');
console.log('Per-asset exact-quantity aggregation tests passed');

const provisionalEvents=[], provisionalSelf={postMessage:m=>provisionalEvents.push(m)};
vm.runInNewContext(workerCode,{
 self:provisionalSelf,TextDecoder,Blob,setTimeout,BigInt,Date,Number,Math,Uint8Array,String,Array,Object,RegExp,Error
},{filename:'valuation-worker-review.js'});
const example='datetime_jst,asset,amount,category\n'+
 '2024/12/26 23:02,USDC,10,review\n'+
 '2025/01/01 13:00,BTC,0.1,onchain_reported\n'+
 '2025/01/01 13:00,ETH,1,service_credit\n'+
 '2025/01/01 13:00,XRP,0,zero\n';
await provisionalSelf.onmessage({data:{type:'import',file:new Blob([example]),id:'rows'}});
const rr=provisionalEvents.filter(m=>m.type==='batch').flatMap(m=>m.rows);
assert.equal(rr.length,4);
assert.deepEqual(Array.from(rr,r=>r.included),[true,true,false,false]);
console.log('Provisional review and explicit exclusion defaults passed');

const depositEvents=[],depositSelf={postMessage:m=>depositEvents.push(m)};
vm.runInNewContext(workerCode,{
 self:depositSelf,TextDecoder,Blob,setTimeout,BigInt,Date,Number,Math,Uint8Array,String,Array,Object,RegExp,Error
},{filename:'valuation-worker-deposit.js'});
const depositCsv=[
 'datetime_jst,asset,amount,category,included',
 '2024/12/26 23:02,USDC,10,deposit,',
 '2025/01/16 18:12,BTC,0.1,deposit,',
 '2025/01/16 18:12,ETH,1,service_credit,',
 '2025/01/16 18:12,XRP,0,deposit,',
 '2025/01/16 18:12,SOL,2,deposit,no',
 '2025/01/16 18:12,OP,3,review,'
].join('\\n')+'\\n';
await depositSelf.onmessage({data:{type:'import',file:new Blob([depositCsv]),id:'rows'}});
const depositRows=depositEvents.filter(m=>m.type==='batch').flatMap(m=>m.rows);
assert.equal(depositRows.length,6);
assert.deepEqual(Array.from(depositRows,r=>r.included),[true,true,false,false,false,true]);
console.log('Deposit classification and explicit exclusion test passed');
