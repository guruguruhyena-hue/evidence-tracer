
const EVM_CHAINS=[
{name:'Ethereum',chainId:'1',symbol:'ETH'},{name:'BNB Smart Chain',chainId:'56',symbol:'BNB'},{name:'Polygon',chainId:'137',symbol:'POL'},{name:'Arbitrum One',chainId:'42161',symbol:'ETH'},{name:'OP Mainnet',chainId:'10',symbol:'ETH'},{name:'Base',chainId:'8453',symbol:'ETH'},{name:'Avalanche C-Chain',chainId:'43114',symbol:'AVAX'},{name:'Linea',chainId:'59144',symbol:'ETH'},{name:'Scroll',chainId:'534352',symbol:'ETH'},{name:'zkSync Era',chainId:'324',symbol:'ETH'},{name:'HyperEVM',chainId:'999',symbol:'HYPE'},{name:'opBNB',chainId:'204',symbol:'BNB'}];
let matches=[],lastMeta={};
let scanRetrievedAt=null;
const knownProfile={
 caseProfile:'IZAKA-YA',version:'2026-11-22.1',
 addresses:[
 {id:'ADR-ETH-0001',chain:'evm',address:'0x373A411724F5d1D76e873075204EEb15dCFD40C8',classification:'IZAKAYA_DEPOSIT',evidenceLevel:'USER_PRIMARY_EVIDENCE',evidenceRefs:['本人入金履歴']},
 {id:'ADR-SOL-0001',chain:'sol',address:'AxrPw9xsCwmZkhJ9xgBQCFyEJEgmVLcRJ48i6shMr8Az',classification:'IZAKAYA_DEPOSIT',evidenceLevel:'USER_PRIMARY_EVIDENCE',evidenceRefs:['本人入金履歴']},
 {id:'ADR-BTC-0001',chain:'btc',address:'bc1qayqcwz6fy3dhtasdzqhnfpl6z32pggggakuzn6',classification:'IZAKAYA_DEPOSIT',evidenceLevel:'USER_PRIMARY_EVIDENCE',evidenceRefs:['本人入金履歴']},
 {id:'ADR-XRP-0001',chain:'xrp',address:'r3ukRCmW7W5wUTJH2od53By4FmX8FLm7Q5',classification:'IZAKAYA_DEPOSIT',evidenceLevel:'USER_PRIMARY_EVIDENCE',evidenceRefs:['本人入金履歴']},
 {id:'REL-EVM-0001',chain:'evm',address:'0x533c62c39fa1464cd7919d20175663b3e3a8f214',classification:'RELATED_WALLET',evidenceLevel:'RELATED',evidenceRefs:['OC001','PF011']},
 {id:'REL-EVM-0002',chain:'evm',address:'0x4c12e0027ecece9ca8b4e673200e927aa523402d',classification:'RELATED_WALLET',evidenceLevel:'RELATED',evidenceRefs:['OC002','OC003','OC004','OC005','OC007']}
 ]};
const $=id=>document.getElementById(id);
function units(value,decimals){let s=String(value||'0').replace(/^0+/,'')||'0';const d=Number(decimals||0);if(d===0)return s;if(s.length<=d)s=s.padStart(d+1,'0');const a=s.slice(0,-d),b=s.slice(-d).replace(/0+$/,'');return b?(`${a}.${b}`):a;}
function norm(chain,a){return chain==='evm'?String(a).toLowerCase():String(a);}
function matchTransfers(records){return records.flatMap(r=>{const hit=knownProfile.addresses.find(k=>k.chain===r.chain&&norm(k.chain,k.address)===norm(k.chain,r.to));return hit?[Object.assign({},r,{matchedAddressId:hit.id,classification:hit.classification,evidenceLevel:hit.evidenceLevel,evidenceRefs:hit.evidenceRefs})]:[];});}
async function scanBitcoin(req){const API='https://blockstream.info/api';const res=await fetch(`${API}/address/${encodeURIComponent(req.address)}/txs`,{cache:'no-store'});if(!res.ok)throw new Error('Bitcoin API error '+res.status);const all=await res.json(),out=[];for(const tx of all.slice(0,req.maxRecords||200)){if(!(tx.vin||[]).some(v=>v.prevout&&v.prevout.scriptpubkey_address===req.address))continue;for(const vout of tx.vout||[]){const to=vout.scriptpubkey_address;if(!to||to===req.address)continue;out.push({chain:'btc',network:'Bitcoin',txid:tx.txid,timestamp:tx.status&&tx.status.block_time||null,from:req.address,to,asset:'BTC',amount:units(vout.value,8),status:tx.status&&tx.status.confirmed?'confirmed':'pending',raw:tx});}}return out;}
async function evmQuery(params){const u=new URL('https://api.etherscan.io/v2/api');Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,v));const r=await fetch(u);if(!r.ok)throw new Error('Etherscan HTTP '+r.status);const j=await r.json();if(j.status==='0'&&!String(j.message||'').toLowerCase().includes('no transactions'))throw new Error(String(j.result||j.message||'Etherscan API error'));return Array.isArray(j.result)?j.result:[];}
async function scanEvm(req){if(!req.apiKey)throw new Error('Etherscan API keyが必要です。ブラウザメモリにのみ保持されます。');const c=EVM_CHAINS.find(x=>x.chainId===req.network);const base={chainid:c.chainId,module:'account',address:req.address,startblock:'0',endblock:'999999999',page:'1',offset:String(req.maxRecords||200),sort:'asc',apikey:req.apiKey};const [normal,token]=await Promise.all([evmQuery({...base,action:'txlist'}),evmQuery({...base,action:'tokentx'})]);const a=req.address.toLowerCase(),out=[];for(const t of normal){if(String(t.from).toLowerCase()!==a||!t.to)continue;out.push({chain:'evm',network:c.name,txid:t.hash,timestamp:Number(t.timeStamp),from:t.from,to:t.to,asset:c.symbol,amount:units(t.value,18),status:t.isError==='0'?'confirmed':'unknown',raw:t});}for(const t of token){if(String(t.from).toLowerCase()!==a||!t.to)continue;out.push({chain:'evm',network:c.name,txid:t.hash,timestamp:Number(t.timeStamp),from:t.from,to:t.to,asset:t.tokenSymbol||'TOKEN',amount:units(t.value,t.tokenDecimal),status:'confirmed',raw:t});}return out;}
async function rpc(url,method,params){const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});if(!r.ok)throw new Error('RPC HTTP '+r.status);const j=await r.json();if(j.error)throw new Error(j.error.message);return j.result;}
async function scanSolana(req){const url=req.rpcUrl||'https://api.mainnet-beta.solana.com';const sigs=await rpc(url,'getSignaturesForAddress',[req.address,{limit:Math.min(req.maxRecords||100,1000),commitment:'finalized'}]);const out=[];for(const s of sigs){const tx=await rpc(url,'getTransaction',[s.signature,{encoding:'jsonParsed',commitment:'finalized',maxSupportedTransactionVersion:0}]);if(!tx)continue;for(const i of tx.transaction?.message?.instructions||[]){const p=i.parsed;if(p&&p.type==='transfer'&&p.info?.source===req.address&&p.info?.destination&&p.info?.lamports!=null)out.push({chain:'sol',network:'Solana',txid:s.signature,timestamp:tx.blockTime,from:req.address,to:p.info.destination,asset:'SOL',amount:units(p.info.lamports,9),status:'finalized',raw:tx});}}return out;}
async function scanXrp(req){const url=req.rpcUrl||'https://xrplcluster.com/';const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({method:'account_tx',params:[{account:req.address,ledger_index_min:-1,ledger_index_max:-1,binary:false,limit:req.maxRecords||200,forward:false}]})});if(!r.ok)throw new Error('XRPL HTTP '+r.status);const j=await r.json(),out=[];for(const e of j.result?.transactions||[]){const t=e.tx_json||e.tx||e;if(t.TransactionType!=='Payment'||t.Account!==req.address||!t.Destination)continue;out.push({chain:'xrp',network:'XRP Ledger',txid:t.hash||e.hash||'',timestamp:typeof t.date==='number'?t.date+946684800:null,from:t.Account,to:t.Destination,asset:typeof t.Amount==='string'?'XRP':(t.Amount?.currency||'ISSUED'),amount:typeof t.Amount==='string'?units(t.Amount,6):String(t.Amount?.value||''),status:'validated',raw:e});}return out;}
async function sha256(text){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
function download(name,data,type='text/plain'){const b=typeof data==='string'?new Blob([data],{type}):data;const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}

function exportChainLabel(){
  const kind=$('kind').value;
  if(kind==='btc') return 'BTC';
  if(kind==='sol') return 'SOL';
  if(kind==='xrp') return 'XRP';
  if(kind==='evm'){
    const map={
      '1':'ETH','56':'BNB','137':'POLYGON','42161':'ARBITRUM','10':'OP',
      '8453':'BASE','43114':'AVAX','59144':'LINEA','534352':'SCROLL',
      '324':'ZKSYNC','999':'HYPEREVM','204':'OPBNB'
    };
    return map[$('network').value]||'EVM';
  }
  return 'CHAIN';
}
function exportBaseName(){ return 'EvidenceTracer-'+exportChainLabel(); }

function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

async function enrichEvidenceRecords(records){
  const out=[];
  for(const r of records){
    const canonical=JSON.stringify({
      chain:r.chain,network:r.network,txid:r.txid,from:r.from,to:r.to,
      asset:r.asset,amount:r.amount,timestamp:r.timestamp,
      matchedAddressId:r.matchedAddressId,classification:r.classification,
      evidenceLevel:r.evidenceLevel,evidenceRefs:r.evidenceRefs
    });
    const recordSha256=await sha256(canonical);
    const chainLabel=exportChainLabel();
    out.push(Object.assign({},r,{
      evidenceId:'ET-'+chainLabel+'-'+recordSha256.slice(0,12).toUpperCase(),
      recordSha256,
      retrievedAt:scanRetrievedAt,
      caseProfileVersion:knownProfile.version,
      matchBasis:'Destination address exactly matches case-profile address '+r.matchedAddressId+'; evidence refs: '+(r.evidenceRefs||[]).join(', ')
    }));
  }
  return out;
}
function renderReportMeta(){
  const el=$('reportMeta');
  if(!el)return;
  if(!lastMeta || !lastMeta.scannedAddress){el.innerHTML='';return;}
  el.innerHTML=
    '<h3>Evidence report metadata</h3>'+
    '<dl class="meta-grid">'+
    '<div><dt>From address</dt><dd><code>'+esc(lastMeta.scannedAddress)+'</code></dd></div>'+
    '<div><dt>Chain / Network</dt><dd>'+esc(exportChainLabel())+(lastMeta.networkName?' / '+esc(lastMeta.networkName):'')+'</dd></div>'+
    '<div><dt>Case Profile Version</dt><dd>'+esc(lastMeta.caseProfileVersion||'—')+'</dd></div>'+
    '<div><dt>Case Profile SHA-256</dt><dd><code>'+esc(lastMeta.caseProfileSha256||'—')+'</code></dd></div>'+
    '<div><dt>Retrieved at</dt><dd>'+esc(lastMeta.retrievedAt||'—')+'</dd></div>'+
    '<div><dt>Processing</dt><dd>LOCAL_BROWSER / server-side storage NONE</dd></div>'+
    '</dl>';
}
function renderEvidenceDetails(){
  const box=$('evidenceDetails'); if(!box)return;
  if(!matches.length){box.innerHTML='';return;}
  box.innerHTML='<h2>Evidence details</h2>'+matches.map(r=>
    '<article class="evidence-card">'+
    '<div class="evidence-id">'+esc(r.evidenceId||'')+'</div>'+
    '<dl class="evidence-grid">'+
    '<div><dt>Evidence ID</dt><dd>'+esc(r.evidenceId||'')+'</dd></div>'+
    '<div><dt>Network</dt><dd>'+esc(r.network)+'</dd></div>'+
    '<div><dt>Asset / Amount</dt><dd>'+esc(r.asset)+' '+esc(r.amount)+'</dd></div>'+
    '<div><dt>Retrieved at</dt><dd>'+esc(r.retrievedAt||'')+'</dd></div>'+
    '<div class="wide"><dt>From</dt><dd><code>'+esc(r.from)+'</code></dd></div>'+
    '<div class="wide"><dt>To</dt><dd><code>'+esc(r.to)+'</code></dd></div>'+
    '<div class="wide"><dt>Full TxID</dt><dd><code>'+esc(r.txid)+'</code></dd></div>'+
    '<div><dt>Classification</dt><dd>'+esc(r.classification)+'</dd></div>'+
    '<div><dt>Evidence Level</dt><dd>'+esc(r.evidenceLevel)+'</dd></div>'+
    '<div><dt>Case Profile Version</dt><dd>'+esc(r.caseProfileVersion||'')+'</dd></div>'+
    '<div class="wide"><dt>Record SHA-256</dt><dd><code>'+esc(r.recordSha256||'')+'</code></dd></div>'+
    '<div class="wide"><dt>Match basis</dt><dd>'+esc(r.matchBasis||'')+'</dd></div>'+
    '</dl></article>').join('');
}

function render(){const rows=$('rows');rows.innerHTML='';for(const r of matches){const tr=document.createElement('tr');tr.innerHTML=`<td>${esc(r.timestamp?new Date(r.timestamp*1000).toLocaleString('ja-JP'):'—')}</td><td>${esc(r.network)}</td><td>${esc(r.asset)}</td><td>${esc(r.amount)}</td><td><code>${esc(r.to)}</code></td><td><code>${esc(r.txid)}</code></td><td>${esc(r.classification)}</td><td>${esc((r.evidenceRefs||[]).join(', '))}</td>`;rows.appendChild(tr);}$('summary').textContent=matches.length+' matched transfer(s).';renderReportMeta();renderEvidenceDetails();}
function init(){ $('network').innerHTML=EVM_CHAINS.map(c=>`<option value="${c.chainId}">${c.name}</option>`).join('');
 const update=()=>{const k=$('kind').value;$('networkWrap').style.display='block';$('network').disabled=k!=='evm';$('networkWrap').style.opacity=k==='evm'?'1':'0.55';$('keyWrap').style.display=k==='evm'?'block':'none';$('rpcWrap').style.display=(k==='sol'||k==='xrp')?'block':'none';};$('kind').addEventListener('change',update);update();
 $('scan').onclick=async()=>{const address=$('addr').value.trim();if(!address)return alert('Public addressを入力してください。');$('status').textContent='Scanning…';try{const req={address,apiKey:$('key').value.trim(),rpcUrl:$('rpc').value.trim()||undefined,network:$('network').value,maxRecords:Number($('max').value)||200};let rec=[];if($('kind').value==='btc')rec=await scanBitcoin(req);if($('kind').value==='evm')rec=await scanEvm(req);if($('kind').value==='sol')rec=await scanSolana(req);if($('kind').value==='xrp')rec=await scanXrp(req);scanRetrievedAt=new Date().toISOString();matches=matchTransfers(rec);matches=await enrichEvidenceRecords(matches);const c=EVM_CHAINS.find(x=>x.chainId===req.network);lastMeta={scannedAddress:address,sourceRecordCount:rec.length,caseProfileVersion:knownProfile.version,caseProfileSha256:await sha256(JSON.stringify(knownProfile)),retrievedAt:scanRetrievedAt,networkName:($('kind').value==='evm'&&c)?c.name:($('kind').value==='btc'?'Bitcoin':$('kind').value==='sol'?'Solana':'XRP Ledger')};render();$('status').textContent='Completed. '+rec.length+' outgoing candidate(s) inspected; '+matches.length+' matched.';}catch(e){$('status').textContent='Error: '+e.message;}};
 $('json').onclick=()=>download(exportBaseName()+'.json',JSON.stringify({meta:lastMeta,records:matches},null,2),'application/json');
 $('print').onclick=()=>{
  const oldTitle=document.title;
  document.title=exportBaseName();
  const restore=()=>{document.title=oldTitle;window.removeEventListener('afterprint',restore);};
  window.addEventListener('afterprint',restore);
  window.print();
  setTimeout(()=>{ if(document.title!==oldTitle) document.title=oldTitle; },1500);
};
 $('clear').onclick=()=>{matches=[];lastMeta={};scanRetrievedAt=null;$('addr').value='';$('key').value='';$('rpc').value='';render();$('status').textContent='Cleared from page memory.';};
}
window.addEventListener('DOMContentLoaded',()=>{try{init();document.body.dataset.appReady='true';}catch(e){document.getElementById('boot-error').textContent='Application error: '+e.message;document.getElementById('boot-error').style.display='block';}});
