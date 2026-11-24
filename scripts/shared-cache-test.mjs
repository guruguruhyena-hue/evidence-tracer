import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../shared-price-db.js',import.meta.url),'utf8');
const calls=[];
const fixture={
 './prices/manifest.json':{schema_version:1,generated_at_utc:'2026-11-24T00:00:00Z',assets:{BTC:{years:['2025']},USDT:{years:['2025']}}},
 './prices/BTC/2025.json':{schema_version:1,asset:'BTC',year:2025,rows:[
  {asset:'BTC',date_utc:'2025-01-05',price_jpy:'14500000.05',source:'Independent test',source_url:'https://example.org/btc',method:'REFERENCE_ONLY'},
  {asset:'BTC',date_utc:'2025-01-06',price_jpy:'14700000.05',source:'Independent test',source_url:'https://example.org/btc',method:'REFERENCE_ONLY'}
 ]},
 './prices/USDT/2025.json':{schema_version:1,asset:'USDT',year:2025,rows:[
  {asset:'USDT',date_utc:'2025-01-05',price_jpy:'153.125',source:'Independent test',method:'USDT_USD_PARITY_ASSUMPTION_X_USDJPY_REFERENCE'}
 ]}
};
const fakeFetch=async path=>{
 calls.push(path);
 return Object.hasOwn(fixture,path)?{ok:true,json:async()=>fixture[path]}:{ok:false,status:404};
};
const local={};
vm.runInNewContext(source,{
 globalThis:local,fetch:fakeFetch,AbortSignal:{timeout:()=>undefined},Set,Map,Date,RegExp,Error,Array,String
});
const result=await local.SharedPriceDatabase.obtain({
 assets:['BTC','USDT','AKC'],dates:['2025-01-05','2025-01-05']
});
assert.equal(result.output.size,2);
assert.equal(result.output.get('BTC|2025-01-05').price,'14500000.05');
assert.equal(result.output.get('USDT|2025-01-05').price,'153.125');
assert.ok(result.errors.some(m=>m.startsWith('AKC:')));
assert.equal(calls.length,3);
assert.ok(calls.every(v=>v.startsWith('./prices/')));
const missing=await local.SharedPriceDatabase.obtain({assets:['ETH'],dates:['2025-01-05']});
assert.equal(missing.output.size,0);
assert.ok(missing.errors.length>=1);
console.log('Shared IZAKA-YA market cache lookup and missing-data tests passed.');
