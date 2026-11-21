(()=>{'use strict';
const $=id=>document.getElementById(id);let last=null;
const NETWORKS={
 '8453':{label:'Base',chainHex:'0x2105',urls:['https://base.blockscout.com/api/v2','https://api.blockscout.com/8453/api/v2'],rpcs:['https://mainnet.base.org','https://base-rpc.publicnode.com'],explorer:'https://base.blockscout.com/tx/'},
 '10':{label:'Optimism',chainHex:'0xa',urls:['https://optimism.blockscout.com/api/v2','https://api.blockscout.com/10/api/v2'],rpcs:['https://mainnet.optimism.io','https://optimism-rpc.publicnode.com'],explorer:'https://optimism.blockscout.com/tx/'}
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

const TRANSFER_TOPIC='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
function decimalHex(hex){
 if(typeof hex!=='string'||!/^0x[0-9a-f]+$/i.test(hex))return null;
 return BigInt(hex).toString(10);
}
function decodeReceiptTransfers(receipt){
 if(!Array.isArray(receipt?.logs))throw Error('Receipt logs not available');
 return receipt.logs.filter(log=>{
  return Array.isArray(log.topics)&&log.topics.length===3&&String(log.topics[0]).toLowerCase()===TRANSFER_TOPIC&&
  /^0x[0-9a-f]{64}$/i.test(log.topics[1])&&/^0x[0-9a-f]{64}$/i.test(log.topics[2])&&
  /^0x[0-9a-f]{64}$/i.test(log.data||'');
 }).map(log=>({
  from:{hash:'0x'+log.topics[1].slice(-40)},to:{hash:'0x'+log.topics[2].slice(-40)},
  token:{symbol:'ERC-20',address:log.address},
  total:{value:decimalHex(log.data),decimals:null},
  rawLog:log,
  amountNote:'raw base units; token decimals not independently fetched'
 }));
}
async function rpcCall(endpoint,method,params){
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),13000);
 try{
  const res=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),cache:'no-store',signal:ctl.signal});
  if(!res.ok)throw Error('HTTP '+res.status);
  const data=await res.json();
  if(data.error)throw Error('RPC '+String(data.error.message||data.error.code||'unknown error'));
  return data.result;
 }finally{clearTimeout(timer);}
}
async function lookupRpc(chain,hash,failures){
 for(const endpoint of chain.rpcs){
  try{
   const id=await rpcCall(endpoint,'eth_chainId',[]);
   if(String(id).toLowerCase()!==chain.chainHex)throw Error('unexpected chain ID '+id);
   const tx=await rpcCall(endpoint,'eth_getTransactionByHash',[hash]);
   if(!tx||String(tx.hash).toLowerCase()!==hash.toLowerCase())throw Error('transaction not found (RPC)');
   const receipt=await rpcCall(endpoint,'eth_getTransactionReceipt',[hash]);
   if(!receipt||String(receipt.transactionHash).toLowerCase()!==hash.toLowerCase())throw Error('receipt not available');
   const tokenTransfers=decodeReceiptTransfers(receipt);
   const normalized={
    hash:tx.hash,from:tx.from,to:tx.to,
    status:receipt.status==='0x1'?'success':receipt.status==='0x0'?'failed':'unknown',
    block_number:decimalHex(receipt.blockNumber),timestamp:'Not retrieved from RPC',
    rpcTransaction:tx,rpcReceipt:receipt
   };
   return {tx:normalized,tokenTransfers,source:endpoint+' (JSON-RPC)',sourceType:'JSON_RPC',warnings:['ERC-20 quantity in raw units (token decimals not independently verified)','Transaction block timestamp not retrieved','Receipt success is independent of wallet ownership']};
  }catch(e){failures.push(endpoint+': '+e.message);}
 }
 throw Error('Blockscout API と公開RPCのいずれからも取得できませんでした。 '+failures.join(' | '));
}

async function lookup(chain,hash){
 const failures=[];
 for(const base of chain.urls){
  try{
   const tx=await json(base+'/transactions/'+hash);
   if(!tx||!tx.hash||String(tx.hash).toLowerCase()!==hash.toLowerCase())throw Error('TxID is missing or does not match');
   const token=await json(base+'/transactions/'+hash+'/token-transfers');
   if(!Array.isArray(token?.items))throw Error('Token transfer response invalid');
   return {tx,tokenTransfers:token.items,source:base,sourceType:'BLOCKSCOUT_API',warnings:[]};
  }catch(e){failures.push(base+': '+e.message);}
 }
 return lookupRpc(chain,hash,failures);
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
  ['Block',t.block_number??'—'],['Time (UTC)',t.timestamp||'—'],['API',out.source],['Notes',(out.warnings||[]).join(' / ')||'Explorer API response']]);
 const tb=$('verifyTransfers');tb.replaceChildren();
 for(const a of out.tokenTransfers){
  const tr=document.createElement('tr');
  const cells=[a.token?.symbol||a.token?.name||'—',readableAmount(a)+(a.amountNote?' (raw units)':''),address(a.from),address(a.to),a.token?.address||'—'];
  for(const c of cells){const td=text('td',c);td.className='breakable';tr.append(td);}tb.append(tr);
 }
 if(!out.tokenTransfers.length){const tr=document.createElement('tr'),td=text('td','トークン移動は返されませんでした。');td.colSpan=5;tr.append(td);tb.append(tr);}
}
$('verifyButton').addEventListener('click',async()=>{
 const hash=$('verifyHash').value.trim(),chain=NETWORKS[$('verifyNetwork').value];
 if(!/^0x[a-fA-F0-9]{64}$/.test(hash)){$('verifyStatus').textContent='0xから始まる64桁の取引ハッシュを入力してください。';return;}
 $('verifyButton').disabled=true;$('verifyExport').disabled=true;last=null;$('verifyTx').textContent='照会中…';$('verifyTransfers').replaceChildren();$('verifyStatus').textContent='Blockscout APIを照会しています。取得できない場合は公式・公開RPCへ切り替えます…';
 try{
  const data=await lookup(chain,hash);show(data,chain);
  last={schema:'evidence-tracer-readonly-tx-verification-v1',retrievedAt:new Date().toISOString(),chain:chain.label,hash,provider:data.source,sourceType:data.sourceType,warnings:data.warnings,transaction:data.tx,tokenTransfers:data.tokenTransfers,verificationScope:'Public explorer API observation; not an ownership or forensic certification'};
  $('verifyStatus').textContent='取引データを取得しました（'+data.sourceType+'）。成功状態とトークン移動の内容を確認してください。RPCの数量はraw単位で表示されます。';
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