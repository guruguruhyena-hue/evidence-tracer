(()=>{'use strict';
const $=id=>document.getElementById(id);
const SOURCES={mempool:'https://mempool.space/api/tx/',blockstream:'https://blockstream.info/api/tx/'};
let result=null;
function node(tag,value){const e=document.createElement(tag);e.textContent=String(value??'—');return e;}
function btc(sats){const v=BigInt(sats);return (v/100000000n).toString()+'.'+(v%100000000n).toString().padStart(8,'0');}
function satAmount(input){
 if(!/^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/.test(input))throw Error('金額はBTC単位で小数8桁以内で入力してください。');
 const [whole,frac='']=input.split('.');
 const sats=BigInt(whole)*100000000n+BigInt(frac.padEnd(8,'0')||'0');
 if(sats>21000000n*100000000n)throw Error('BTC数量が上限を超えています。');
 return sats;
}
function validateTx(tx){return /^[a-f0-9]{64}$/.test(tx);}
function validateAddress(a){return /^(bc1[ac-hj-np-z02-9]{11,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(a);}
async function getTx(id,provider){
 const names=provider==='auto'?['mempool','blockstream']:[provider],errors=[];
 for(const name of names){
  const base=SOURCES[name],ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),12000);
  try{
   const response=await fetch(base+id,{headers:{accept:'application/json'},cache:'no-store',signal:ctrl.signal});
   if(!response.ok)throw Error('HTTP '+response.status);
   const tx=await response.json();
   if(!tx||String(tx.txid).toLowerCase()!==id||!Array.isArray(tx.vout))throw Error('取引データの形式が不正');
   for(const [index,v] of tx.vout.entries()){
    if(!v||!Number.isSafeInteger(v.value)||v.value<0||typeof v.scriptpubkey_address!=='string'&&v.scriptpubkey_address!=null)throw Error('vout '+index+' の形式が不正');
   }
   return {tx,source:base+id};
  }catch(e){errors.push(name+': '+e.message);}finally{clearTimeout(timer);}
 }
 throw Error('すべての照会先で取得できませんでした。'+errors.join(' / '));
}
function show(tx,source,address,expected){
 const tbody=$('btcOutputs');tbody.replaceChildren();
 const hits=[],addressIsBech32=address.startsWith('bc1');
 const same=(actual)=>addressIsBech32?String(actual||'').toLowerCase()===address.toLowerCase():actual===address;
 tx.vout.forEach((out,index)=>{
  const match=same(out.scriptpubkey_address);
  if(match)hits.push({vout:index,valueSats:out.value,valueBtc:btc(out.value)});
  const row=node('tr',''),cells=[
   String(index),out.scriptpubkey_address||'(address unavailable / OP_RETURN)',btc(out.value)+' BTC',match?'✓ 受信先一致':'—'
  ];
  for(const val of cells){const td=node('td',val);td.style.overflowWrap='anywhere';row.append(td);}
  if(match)row.style.fontWeight='700';tbody.append(row);
 });
 const sats=hits.reduce((acc,x)=>acc+BigInt(x.valueSats),0n);
 const dif=expected==null?null:sats-expected;
 const summary=$('btcSummary');summary.replaceChildren();
 const lines=[
  ['TxID',tx.txid],['確認状態',tx.status?.confirmed?'ブロック承認済み':'未承認 / 確認不可'],
  ['Block Height',tx.status?.block_height??'—'],['全出力数（vout）',tx.vout.length],
  ['対象アドレスに一致した出力',hits.length+'件'],
  ['対象アドレスへの出力合計',btc(sats)+' BTC'],
  ['指定した照合額',expected===null?'指定なし':btc(expected)+' BTC'],
  ['数量の一致',expected===null?'指定なし':dif===0n?'完全一致':('不一致（差分 '+(dif<0n?'-':'+')+btc(dif<0n?-dif:dif)+' BTC）')],
  ['データ取得先',source]
 ];
 for(const [key,value] of lines){const p=node('p','');p.append(node('strong',key+'： '),node('span',value));p.style.overflowWrap='anywhere';summary.append(p);}
 return {hits,sumSats:sats.toString(),sumBtc:btc(sats),expectedSats:expected===null?null:expected.toString(),amountMatches:expected===null?null:dif===0n};
}
$('btcQuery').addEventListener('click',async()=>{
 const id=$('btcTx').value.trim().toLowerCase(),address=$('btcAddress').value.trim();
 const amount=$('btcExpected').value.trim();
 if(!validateTx(id)){$('btcStatus').textContent='64桁のBitcoin TxIDを入力してください。';return;}
 if(!validateAddress(address)){$('btcStatus').textContent='Bitcoinメインネットの受信先アドレスを入力してください。';return;}
 let expected=null;try{if(amount)expected=satAmount(amount);}catch(e){$('btcStatus').textContent=e.message;return;}
 const b=$('btcQuery');b.disabled=true;$('btcExport').disabled=true;result=null;
 $('btcSummary').textContent='取得中…';$('btcOutputs').replaceChildren();$('btcStatus').textContent='公開Bitcoinエクスプローラーを照会しています…';
 try{
  const {tx,source}=await getTx(id,$('btcApi').value),match=show(tx,source,address,expected);
  result={
   schema:'evidence-tracer-bitcoin-utxo-verification-v1',retrievedAt:new Date().toISOString(),provider:source,network:'Bitcoin Mainnet',
   txid:id,expectedAddress:address,matchingOutputs:match.hits,matchingSumSats:match.sumSats,matchingSumBtc:match.sumBtc,
   expectedAmountSats:match.expectedSats,amountMatches:match.amountMatches,
   confirmed:tx.status?.confirmed===true,blockHeight:tx.status?.block_height??null,
   sourceResponse:tx,
   caveat:'Explorer API observation; does not independently prove legal wallet ownership or exchange involvement.'
  };
  $('btcStatus').textContent=match.hits.length?'照会成功。指定アドレスへのvoutを確認しました。':'照会成功。ただし指定アドレス宛ての出力は見つかりませんでした。';
  $('btcExport').disabled=false;
 }catch(e){$('btcSummary').textContent='取得できませんでした。';$('btcStatus').textContent=e.message;}
 finally{b.disabled=false;}
});
$('btcExport').addEventListener('click',()=>{
 if(!result)return;
 const blob=new Blob([JSON.stringify(result,null,2)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='EvidenceTracer-BTC-'+result.txid.slice(0,12)+'.json';a.click();
 setTimeout(()=>URL.revokeObjectURL(url),3000);
});
})();