(()=>{'use strict';
const $=id=>document.getElementById(id);let last=null;
const NETWORKS={
 '8453':{label:'Base',urls:['https://base.blockscout.com/api/v2','https://blockscout.routescan.io/8453/api/v2'],explorer:'https://base.blockscout.com/tx/'},
 '10':{label:'Optimism',urls:['https://optimism.blockscout.com/api/v2','https://blockscout.routescan.io/10/api/v2'],explorer:'https://optimism.blockscout.com/tx/'}
};
const text=(tag,value)=>{const n=document.createElement(tag);n.textContent=String(value??'—');return n;};
const address=a=>typeof a==='string'?a:(a?.hash||'—');
function readableAmount(x){
 const n=x?.total?.value,dec=x?.total?.decimals;
 if(n==null||!Number.isInteger(Number(dec))||Number(dec)<0||Number(dec)>36)return String(x?.total?.value??'—');
 const digits=String(n);if(!/^\d+$/.test(digits))return digits;
 const d=Number(dec);if(d===0)return digits;
 const pad=digits.padStart(d+1,'0'),s=pad.slice(0,-d)+'.'+pad.slice(-d).replace(/0+$/,'');
 return s.endsWith('.')?s.slice(0,-1):s;
}
async function json(url){
 const ctl=new AbortController();const timer=setTimeout(()=>ctl.abort(),14000);
 try{const res=await fetch(url,{cache:'no-store',headers:{accept:'application/json'},signal:ctl.signal});if(!res.ok)throw Error('HTTP '+res.status);
 return await res.json();}finally{clearTimeout(timer);}
}
async function lookup(chain,hash){
 const failures=[];
 for(const base of chain.urls){
  try{
   const tx=await json(base+'/transactions/'+hash);
   if(!tx||!tx.hash||String(tx.hash).toLowerCase()!==hash.toLowerCase())throw Error('TxID is missing or does not match');
   const token=await json(base+'/transactions/'+hash+'/token-transfers');
   if(!Array.isArray(token?.items))throw Error('Token transfer response invalid');
   return {tx,tokenTransfers:token.items,source:base};
  }catch(e){failures.push(base+': '+e.message);}
 }
 throw Error('照会できませんでした。'+failures.join(' / '));
}
function setDetails(id,entries){
 const root=$(id);root.replaceChildren();
 for(const [k,v] of entries){
  const p=document.createElement('p'),b=text('strong',k+': '),span=text('span',v);span.className='breakable';p.append(b,span);root.append(p);
 }
}
function show(out,chain){
 const t=out.tx;
 setDetails('verifyTx',[
  ['Network',chain.label],['Transaction Hash',t.hash],['Transaction From',address(t.from)],
  ['Transaction To',address(t.to)],['Transaction Status',t.status||'—'],
  ['Block',t.block_number??'—'],['Time (UTC)',t.timestamp||'—'],['API',out.source]]);
 const tb=$('verifyTransfers');tb.replaceChildren();
 for(const a of out.tokenTransfers){
  const tr=document.createElement('tr');
  const cells=[a.token?.symbol||a.token?.name||'—',readableAmount(a),address(a.from),address(a.to),a.token?.address||'—'];
  for(const c of cells){const td=text('td',c);td.className='breakable';tr.append(td);}tb.append(tr);
 }
 if(!out.tokenTransfers.length){const tr=document.createElement('tr'),td=text('td','トークン移動は返されませんでした。');td.colSpan=5;tr.append(td);tb.append(tr);}
}
$('verifyButton').addEventListener('click',async()=>{
 const hash=$('verifyHash').value.trim(),chain=NETWORKS[$('verifyNetwork').value];
 if(!/^0x[a-fA-F0-9]{64}$/.test(hash)){$('verifyStatus').textContent='0xから始まる64桁の取引ハッシュを入力してください。';return;}
 $('verifyButton').disabled=true;$('verifyExport').disabled=true;last=null;$('verifyTx').textContent='照会中…';$('verifyTransfers').replaceChildren();$('verifyStatus').textContent='Blockscout APIを照会しています…';
 try{
  const data=await lookup(chain,hash);show(data,chain);
  last={schema:'evidence-tracer-readonly-tx-verification-v1',retrievedAt:new Date().toISOString(),chain:chain.label,hash,provider:data.source,transaction:data.tx,tokenTransfers:data.tokenTransfers,verificationScope:'Public explorer API observation; not an ownership or forensic certification'};
  $('verifyStatus').textContent='取引データを取得しました。成功状態とトークン移動の内容を確認してください。';
  $('verifyExport').disabled=false;
 }catch(e){$('verifyTx').textContent='取得できませんでした。';$('verifyStatus').textContent=e.message+'。エクスプローラーへの直接アクセスやネットワーク設定を確認してください。';}
 finally{$('verifyButton').disabled=false;}
});
$('verifyExport').addEventListener('click',()=>{
 if(!last)return;
 const blob=new Blob([JSON.stringify(last,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='EvidenceTracer-Tx-'+last.chain+'-'+last.hash.slice(0,12)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
});
})();