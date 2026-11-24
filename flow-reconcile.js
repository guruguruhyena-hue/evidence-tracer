'use strict';
/* Generic, local-only ledger reconciliation. Does not store case data or equate service claims with on-chain receipts. */
(function(root){
const TYPES=new Set(['deposit','exchange_out','exchange_in','lending_start','lending_end','lending_profit','withdrawal_sent','withdrawal_pending','fee','merchant_out','merchant_refund','adjustment_in','adjustment_out']);
const FIELDS=['id','datetime_jst','type','asset','amount','fee','fee_asset','pair_id','status','txid','source','source_page','notes'];
function parseDecimal(v){
 const s=String(v??'').trim().replaceAll(',','');
 if(s.length>100)throw Error('無効な数量 '+s.slice(0,50));
 const m=s.match(/^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);
 if(!m)throw Error('無効な数量 '+s.slice(0,50));
 const expo=Number(m[3]||0);
 if(!Number.isInteger(expo)||Math.abs(expo)>30)throw Error('指数の範囲外 '+s.slice(0,50));
 const whole=m[1],frac=m[2]||'',scale=frac.length-expo;
 const n=BigInt(whole+frac);
 return scale>=0?{n,s:scale}:{n:n*10n**BigInt(-scale),s:0};
}
function add(a,b){
 const scale=Math.max(a.s,b.s);
 return {n:a.n*10n**BigInt(scale-a.s)+b.n*10n**BigInt(scale-b.s),s:scale};
}
function neg(a){return {n:-a.n,s:a.s}}
function zero(){return {n:0n,s:0}}
function fmt(a){
 let n=a.n<0n?-a.n:a.n;
 let s=n.toString().padStart(a.s+1,'0');
 if(a.s)s=s.slice(0,-a.s)+'.'+s.slice(-a.s);
 return (a.n<0n?'-':'')+s.replace(a.s?(/\.?0+$/):/$^/,'');
}
function sum(rows){return fmt(rows.reduce((acc,v)=>add(acc,parseDecimal(v)),zero()))}
function validate(rows){
 const errors=[],normalized=[],seen=new Map();
 for(let i=0;i<rows.length;i++){
  const row=rows[i]||{},id=String(row.id||'ROW-'+(i+1));
  const type=String(row.type||'').trim().toLowerCase(),asset=String(row.asset||'').trim().toUpperCase();
  let amt;
  if(!TYPES.has(type)){errors.push(id+': 未対応type '+type);continue}
  if(!/^[A-Z0-9]{2,12}$/.test(asset)){errors.push(id+': assetが不正');continue}
  try{amt=parseDecimal(row.amount)}catch(e){errors.push(id+': '+e.message);continue}
  if(amt.n<=0n){errors.push(id+': amountは正の数が必要');continue}
  const fee=String(row.fee??'').trim();
  if(fee){try{if(parseDecimal(fee).n<0n)throw Error('negative')}catch{errors.push(id+': feeが不正');continue}}
  const feeAsset=String(row.fee_asset||asset).trim().toUpperCase();
  const pairId=String(row.pair_id||'').trim(),status=String(row.status||'').trim().toLowerCase();
  const date=String(row.datetime_jst||'').trim();
  if(date&&!/^\d{4}[/-]\d\d[/-]\d\d \d\d:\d\d/.test(date))errors.push(id+': 日時の形式要確認');
  const key=[type,id,asset].join('|');
  if(seen.has(key))errors.push(id+': 同一種別・銘柄・ID重複。原本照合必要');
  seen.set(key,i);
  normalized.push({...row,id,type,asset,amount:fmt(amt),fee:fee||'0',fee_asset:feeAsset,pair_id:pairId,status});
 }
 return {rows:normalized,errors};
}
function reconcile(input){
 const {rows,errors}=validate(input),map=new Map(),warnings=[...errors],events=[];
 const get=asset=>{if(!map.has(asset))map.set(asset,{
  asset,deposits:0,exchange_in:0,exchange_out:0,loans_started:0,loans_ended:0,profits:0,
  withdrawals_sent:0,withdrawals_pending:0,merchant_out:0,merchant_refund:0,
  fees:0,adjustments:0,deposit_qty:zero(),exchange_in_qty:zero(),exchange_out_qty:zero(),
  profit_qty:zero(),sent_qty:zero(),pending_qty:zero(),fee_qty:zero(),pending_fee_quoted_qty:zero(),merchant_out_qty:zero(),
  merchant_refund_qty:zero(),adjustment_qty:zero(),net_pre_pending:zero(),loan_start_qty:zero(),loan_end_qty:zero()
 });return map.get(asset)};
 for(const r of rows){
  const x=get(r.asset),amount=parseDecimal(r.amount);
  const plus=(field)=>{x[field]=add(x[field],amount)};
  const event={id:r.id,type:r.type,asset:r.asset,quantity:r.amount,delta:'0',classification:''};
  let delta=zero();
  switch(r.type){
   case 'deposit':x.deposits++;plus('deposit_qty');delta=amount;event.classification='service_deposit';break;
   case 'exchange_in':x.exchange_in++;plus('exchange_in_qty');delta=amount;event.classification='internal_exchange_credit';break;
   case 'exchange_out':x.exchange_out++;plus('exchange_out_qty');delta=neg(amount);event.classification='internal_exchange_debit';break;
   case 'lending_start':x.loans_started++;plus('loan_start_qty');event.classification='internal_principal_lock_not_external_transfer';break;
   case 'lending_end':x.loans_ended++;plus('loan_end_qty');event.classification='internal_principal_release_not_external_transfer';break;
   case 'lending_profit':x.profits++;plus('profit_qty');delta=amount;event.classification='claimed_service_profit';break;
   case 'withdrawal_sent':x.withdrawals_sent++;plus('sent_qty');delta=neg(amount);event.classification='service_sent_claim_not_wallet_proof';break;
   case 'withdrawal_pending':x.withdrawals_pending++;plus('pending_qty');event.classification='request_pending_not_onchain_sent';break;
   case 'merchant_out':x.merchant_out++;plus('merchant_out_qty');delta=neg(amount);event.classification='merchant_conversion_or_refund_correspondence';break;
   case 'merchant_refund':x.merchant_refund++;plus('merchant_refund_qty');delta=amount;event.classification='merchant_refund';break;
   case 'adjustment_in':x.adjustments++;x.adjustment_qty=add(x.adjustment_qty,amount);delta=amount;break;
   case 'adjustment_out':x.adjustments++;x.adjustment_qty=add(x.adjustment_qty,neg(amount));delta=neg(amount);break;
   case 'fee':x.fees++;x.fee_qty=add(x.fee_qty,amount);delta=neg(amount);event.classification='explicit_fee';break;
  }
  x.net_pre_pending=add(x.net_pre_pending,delta);event.delta=fmt(delta);events.push(event);
  // Fee belongs to exact asset; never double charge fee already embedded in gross amount.
  if(r.fee!=='0'){
   if(r.type==='withdrawal_pending'){
    const quoted=get(r.fee_asset);quoted.pending_fee_quoted_qty=add(quoted.pending_fee_quoted_qty,parseDecimal(r.fee));
    events.push({id:r.id+':quoted_fee',type:'withdrawal_pending_fee_quote',asset:r.fee_asset,quantity:r.fee,delta:'0',classification:'quoted_not_deducted_pending_fee'});
    continue;
   }
   const fx=get(r.fee_asset),f=parseDecimal(r.fee);
   fx.fees++;fx.fee_qty=add(fx.fee_qty,f);fx.net_pre_pending=add(fx.net_pre_pending,neg(f));
   events.push({id:r.id+':fee',type:'fee',asset:r.fee_asset,quantity:r.fee,delta:fmt(neg(f)),classification:'fee_attached_to_event'});
  }
 }
 const pairs=new Map();
 for(const r of rows.filter(v=>v.type==='exchange_in'||v.type==='exchange_out')){
  if(!r.pair_id){warnings.push(r.id+': 交換にはpair_idを記録してください');continue}
  if(!pairs.has(r.pair_id))pairs.set(r.pair_id,[]);
  pairs.get(r.pair_id).push(r);
 }
 for(const [id,list] of pairs)if(list.length!==2||list.filter(r=>r.type==='exchange_out').length!==1||list.filter(r=>r.type==='exchange_in').length!==1)warnings.push('交換 '+id+': 支払側と受取側が1件ずつでないため確認');
 for(const item of map.values()){
  if(item.loans_started!==item.loans_ended||fmt(item.loan_start_qty)!==fmt(item.loan_end_qty))
   warnings.push(item.asset+': 融資開始・終了の件数または元本が不一致。複数運用・期末跨ぎを確認');
  // Count is a count of entries, not necessarily external flows.
  for(const k of Object.keys(item))if(k.endsWith('_qty')||k==='net_pre_pending')item[k]=fmt(item[k]);
 }
 return {assets:[...map.values()].sort((a,b)=>a.asset.localeCompare(b.asset)),events,warnings,
  totals:{input_rows:input.length,valid_rows:rows.length,deposit_rows:rows.filter(r=>r.type==='deposit').length,
   exchanges:new Set(rows.filter(r=>r.pair_id&&(r.type==='exchange_in'||r.type==='exchange_out')).map(r=>r.pair_id)).size,
   loan_events:rows.filter(r=>r.type==='lending_start'||r.type==='lending_end').length,
   withdrawal_records:rows.filter(r=>r.type==='withdrawal_sent'||r.type==='withdrawal_pending').length},
  method:'Deposit + exchange-in - exchange-out + claimed lending profit - recorded sent withdrawals - explicit fees - merchant out + merchant refunds +/- manual adjustments. Pending withdrawals and their quoted fees shown separately and NOT deducted as paid fees. Not an on-chain or legal damages determination.'};
}
function fromPdfHistory(rows){
 const result=[],warnings=[];
 for(const r of rows){
  if(r.type==='deposit'||r.type==='lending_start'){
   result.push({...r,type:r.type,amount:r.amount,fee:'',pair_id:'',status:r.type==='deposit'?'service_record':'internal',source:r.source||''});
  }else if(r.type==='lending_end'){
   result.push({...r,fee:'',pair_id:'',status:'internal'});
   const m=String(r.notes||'').match(/(?:記載利益|利益は)\s*([\d,.]+)\s+([A-Z0-9]+)/);
   if(m)result.push({...r,id:r.id+':profit',type:'lending_profit',asset:m[2],amount:m[1].replaceAll(',',''),status:'service_claimed',notes:r.notes});
   else warnings.push(r.id+': 融資終了の利益が抽出できません');
  }else if(r.type==='withdrawal_sent'){
   result.push({...r,status:'service_sent_unverified',fee:'',pair_id:''});
  }else if(r.type==='exchange'){
   warnings.push(r.id+': 交換は2通貨が必要です。受取数量を確認してexchange_out / exchange_inの2行で登録してください。');
  }else warnings.push(r.id+': 未対応の履歴 '+r.type);
 }
 return {rows:result,warnings};
}
root.IzkFlow={FIELDS,TYPES,parseDecimal,add,fmt,sum,validate,reconcile,fromPdfHistory};
})(globalThis);
