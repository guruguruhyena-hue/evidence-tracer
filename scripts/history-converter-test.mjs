import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const text=readFileSync(new URL('../history-converter.js',import.meta.url),'utf8');
const host={};
vm.runInNewContext(text,{globalThis:host,BigInt,Set,Date,RegExp,String,Array,Object,Number,Error});
const p=host.IzkHistory;
const pages=[{page:1,text:[
 '2026/09/02 11:52 履歴｜IZAKA-YA',
 '2026/08/18 00:57',
 '218,000 AKC を入金しました',
 '受信Walletアドレス : 0x123',
 'TxID : -',
 '2025/12/22 14:20',
 '170.745602 XRP を入金しました',
 '受信Walletアドレス : r3ukRC',
 '受信宛先タグ : 4121162714',
 'TxID : ABCD'
].join('\n')},{page:2,text:[
 '2026/08/30 00:00',
 '4.02169864 SOLの融資が終了しました',
 '利益は 0.3305505 SOL です',
 '2026/07/31 01:21',
 '4.02169864 SOL の融資を開始しました'
].join('\n')}];
const parsed=p.parsePdfPages(pages,'sample.pdf','sha256-test');
assert.equal(parsed.records.length,4);
assert.equal(parsed.records.filter(r=>r.type==='deposit').length,2);
assert.equal(parsed.records[1].amount,'170.745602');
assert.equal(parsed.records[1].destination_tag,'4121162714');
assert.equal(parsed.records[1].source_page,'1');
assert.equal(parsed.records[2].notes,'融資終了・記載利益 0.3305505 SOL');
const csv=p.toCsv(parsed.records,['type','asset','amount','datetime_jst','source_page']);
const restored=p.parseCsv(csv);
assert.equal(restored.length,4);
assert.equal(restored[1].asset,'XRP');
assert.equal(restored[1].amount,'170.745602');
assert.deepEqual(Array.from(p.parseOrder('asset, amount, datetime_jst',p.STANDARD)),['asset','amount','datetime_jst']);
assert.throws(()=>p.parseOrder('amount, amount',p.STANDARD));
assert.equal(p.safeValuationRows(parsed.records).length,2);
assert.equal(p.decimalSum(['0.1','0.2','0.00000001']),'0.30000001');
const recon=p.reconcile(parsed.records,parsed.records);
assert.ok(recon.some(x=>x.asset==='XRP'&&x.deposits===1));
console.log('History PDF / CSV normalizer and column mapping tests passed.');

const splitRecord=p.parsePdfPages([
 {page:1,text:'2025/10/02 09:00\n5 BTC を入金しました\nTxID : FIRST\n2025/10/01 11:00\n'},
 {page:2,text:'2026/09/02 11:52 履歴｜IZAKA-YA\n218.645344 USDT (ERC20) を入金しました\n受信Walletアドレス : 0x123\nTxID : SECOND\n2025/09/30 10:00\n1 ETH を入金しました\nTxID : THIRD'}
],'history.pdf','sha-test');
assert.equal(splitRecord.records.length,3,'Transaction split by page border should be preserved');
assert.equal(splitRecord.records[1].asset,'USDT');
assert.equal(splitRecord.records[1].amount,'218.645344');
assert.equal(splitRecord.records[1].source_page,'1','Original timestamp appears on prior page');
console.log('Cross-page transaction parsing test passed.');
