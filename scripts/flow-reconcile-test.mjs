import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../flow-reconcile.js',import.meta.url),'utf8');
const context={};
vm.runInNewContext(source,{globalThis:context,BigInt,String,Set,Map,Array,Object,Math,Error});
const f=context.IzkFlow;
const rows=[
 {id:'D1',type:'deposit',asset:'BTC',amount:'0.1'},
 {id:'XOUT',type:'exchange_out',asset:'BTC',amount:'0.01',pair_id:'X1'},
 {id:'XIN',type:'exchange_in',asset:'ETH',amount:'0.2',pair_id:'X1'},
 {id:'LSTART',type:'lending_start',asset:'ETH',amount:'0.2'},
 {id:'LEND',type:'lending_end',asset:'ETH',amount:'0.2'},
 {id:'LPROFIT',type:'lending_profit',asset:'ETH',amount:'0.002'},
 {id:'W1',type:'withdrawal_sent',asset:'ETH',amount:'0.1',fee:'0.001'},
 {id:'W2',type:'withdrawal_pending',asset:'ETH',amount:'0.05'}
];
const output=f.reconcile(rows);
assert.equal(output.totals.deposit_rows,1);
assert.equal(output.totals.exchanges,1);
assert.equal(output.totals.loan_events,2);
assert.equal(output.totals.withdrawal_records,2);
assert.equal(output.assets.find(a=>a.asset==='BTC').net_pre_pending,'0.09');
assert.equal(output.assets.find(a=>a.asset==='ETH').net_pre_pending,'0.101');
assert.equal(output.assets.find(a=>a.asset==='ETH').pending_qty,'0.05');
assert.equal(output.assets.find(a=>a.asset==='ETH').fee_qty,'0.001');
assert.equal(output.warnings.length,0);
assert.equal(f.sum(['0.1','0.2','0.00000001']),'0.30000001');
assert.equal(f.reconcile(rows.filter(r=>r.id!=='XIN')).warnings.some(w=>w.includes('交換 X1')),true);
assert.equal(f.reconcile([...rows,{id:'W3',type:'withdrawal_pending',asset:'SOL',amount:'4.3'}]).assets.find(a=>a.asset==='SOL').net_pre_pending,'0');
assert.equal(f.reconcile([...rows,{id:'BROKEN',type:'fee',asset:'BTC',amount:'-0.1'}]).warnings.some(w=>w.includes('BROKEN')),true);
console.log('Four-ledger flow reconciliation tests passed.');


const audit=[
 {id:'J-D0',kind:'external_deposit_reported',asset:'BTC',raw_amount:'0',wallet_delta:'0'},
 {id:'J-D1',kind:'external_deposit_reported',asset:'BTC',raw_amount:'3E-9',wallet_delta:'3E-9'},
 {id:'J-XOUT',kind:'internal_swap_out',asset:'BTC',raw_amount:'1E-9',wallet_delta:'-1E-9',reported_fee:'0 BTC',link_id:'X2'},
 {id:'J-XIN',kind:'internal_swap_in',asset:'ETH',raw_amount:'0.01',wallet_delta:'0.01',reported_fee:'0 ETH',link_id:'X2'},
 {id:'J-WAIT',kind:'withdraw_pending_internal',asset:'ETH',raw_amount:'0.009',wallet_delta:'-0.0095',pending_delta:'0.0095',reported_fee:'0.0005'}
];
const imported=f.fromAuditJournal(audit),result=f.reconcile(imported);
assert.equal(imported.length,5);
assert.equal(result.totals.valid_rows,5);
assert.equal(result.totals.deposit_rows,2,'zero quantity service record remains counted');
assert.equal(result.assets.find(x=>x.asset==='BTC').net_pre_pending,'0.000000002');
assert.equal(result.assets.find(x=>x.asset==='ETH').net_pre_pending,'0.01','quoted pending fee must not debit pre-application balance');
assert.equal(result.assets.find(x=>x.asset==='ETH').pending_qty,'0.009');
assert.equal(result.assets.find(x=>x.asset==='ETH').pending_fee_quoted_qty,'0.0005');
assert.equal(result.warnings.length,0);
console.log('Audit journal scientific amounts and pending-fee tests passed.');
