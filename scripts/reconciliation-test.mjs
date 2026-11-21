import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync('app.js','utf8');
const document={getElementById(id){return {value:id==='timeTolerance'?'5':''}}};
const window={addEventListener(){}};
const store={getItem(){return null},setItem(){},removeItem(){}};
const evaluate=new Function('window','document','localStorage',source+`
sessionEvidencePool=[
  {chain:'evm',network:'Ethereum',asset:'USDT',amount:'416.611255',txid:'0xabc',to:'0x123',from:'0x999',timestamp:100,evidenceId:'ET-1'},
  {chain:'xrp',network:'XRP Ledger',asset:'XRP',amount:'170.745602',txid:'ABC',to:'rDest',from:'rFrom',destinationTag:4121162714,timestamp:100,evidenceId:'ET-2'}
];
importedLedger=[
  {recordId:'true-evm',txid:'0xabc',asset:'USDT',amount:'416.611255',destinationAddress:'0x123',timestamp:100},
  {recordId:'wrong-amount',txid:'0xabc',asset:'USDT',amount:'416.611256',destinationAddress:'0x123',timestamp:100},
  {recordId:'wrong-address',txid:'0xabc',asset:'USDT',amount:'416.611255',destinationAddress:'0x456',timestamp:100},
  {recordId:'true-xrp',txid:'ABC',asset:'XRP',amount:'170.745602',destinationAddress:'rDest',destinationTag:'4121162714',timestamp:100},
  {recordId:'wrong-xrp-tag',txid:'ABC',asset:'XRP',amount:'170.745602',destinationAddress:'rDest',destinationTag:'123',timestamp:100},
  {recordId:'pdf-boundary',asset:'SOL',amount:'0.000000001',parseWarning:'INCOMPLETE_PAGE_BOUNDARY_RECORD'}
];
return {statuses:reconcileLedger().map(r=>r.status),decimal:addDecimalStrings(['0.000000001','0.000000002']),solanaRpcEndpoints:solanaRpcEndpoints().length};
`);
const actual=evaluate(window,document,store);
assert.deepEqual(actual.statuses,[
  'SELF_WALLET_CONFIRMED','UNRESOLVED','UNRESOLVED',
  'SELF_WALLET_CONFIRMED','UNRESOLVED','UNRESOLVED'
]);
assert.equal(actual.decimal,'0.000000003');
assert.ok(actual.solanaRpcEndpoints>=3);
console.log('Evidence reconciliation regression tests passed');
