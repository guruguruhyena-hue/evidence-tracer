
const EVM_CHAINS=[
{name:'Ethereum',chainId:'1',symbol:'ETH'},{name:'BNB Smart Chain',chainId:'56',symbol:'BNB'},{name:'Polygon',chainId:'137',symbol:'POL'},{name:'Arbitrum One',chainId:'42161',symbol:'ETH'},{name:'OP Mainnet',chainId:'10',symbol:'ETH'},{name:'Base',chainId:'8453',symbol:'ETH'},{name:'Avalanche C-Chain',chainId:'43114',symbol:'AVAX'},{name:'Linea',chainId:'59144',symbol:'ETH'},{name:'Scroll',chainId:'534352',symbol:'ETH'},{name:'zkSync Era',chainId:'324',symbol:'ETH'},{name:'HyperEVM',chainId:'999',symbol:'HYPE'},{name:'opBNB',chainId:'204',symbol:'BNB'}];
let matches=[],lastMeta={};
let sessionEvidencePool=[];
let importedLedger=[];
let reconciliationResults=[];
let importedSourceMeta=null;
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
async function rpc(url,method,params){const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});if(!r.ok){
  let detail='';
  try{detail=' '+await r.text();}catch{}
  throw new Error('RPC HTTP '+r.status+detail.slice(0,180));
}const j=await r.json();if(j.error)throw new Error(j.error.message);return j.result;}
async function scanSolana(req){
  const endpoints=req.rpcUrl?[req.rpcUrl]:[
    'https://solana-rpc.publicnode.com',
    'https://public-solana-mainnet.rpcnode.dev',
    'https://api.mainnet.solana.com'
  ];
  let lastErr=null;
  for(const url of endpoints){
    try{
      const sigs=await rpc(url,'getSignaturesForAddress',[req.address,{limit:Math.min(req.maxRecords||100,1000),commitment:'finalized'}]);
      const out=[];
      for(const sig of sigs){
        const tx=await rpc(url,'getTransaction',[sig.signature,{encoding:'jsonParsed',commitment:'finalized',maxSupportedTransactionVersion:0}]);
        if(!tx)continue;
        for(const i of tx.transaction?.message?.instructions||[]){
          const p=i.parsed;
          if(p&&p.type==='transfer'&&p.info?.source===req.address&&p.info?.destination&&p.info?.lamports!=null){
            out.push({chain:'sol',network:'Solana',txid:sig.signature,timestamp:tx.blockTime,block:tx.slot,from:req.address,to:p.info.destination,asset:'SOL',amount:units(p.info.lamports,9),status:'finalized',source:'Solana JSON-RPC '+url,raw:tx});
          }
        }
      }
      return out;
    }catch(e){
      lastErr=e;
      if(req.rpcUrl) break;
    }
  }
  throw new Error((lastErr?.message||'Solana RPC failed')+' — All public Solana RPC fallbacks failed or were rate-limited. Try a Custom RPC URL.');
}
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


function addToSessionPool(records){
  const key=r=>[r.chain,r.txid,r.to,r.asset,r.amount].join('|');
  const existing=new Set(sessionEvidencePool.map(key));
  for(const r of records){const k=key(r);if(!existing.has(k)){sessionEvidencePool.push(r);existing.add(k);}}
}

async function sha256Bytes(buffer){
  const b=await crypto.subtle.digest('SHA-256',buffer);
  return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function loadPdfJs(){
  const pdfjs=await import('./vendor/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc='./vendor/pdf.worker.mjs';
  return pdfjs;
}
function normalizeIzkyAsset(raw){
  return String(raw||'').replace(/\s*\((ERC20|BEP20|TRC20|SPL)\)\s*/gi,'').trim().toUpperCase();
}
function parseIzkyDepositPage(pageText,pageNumber,sourceName,pdfSha){
  const cleaned=pageText.replace(/\u00a0/g,' ').replace(/\r/g,' ').replace(/\n/g,' ').replace(/[ \t]+/g,' ').trim();
  const rows=[];
  const txRe=/TxID\s*:\s*([^\s]+)/g;
  let m,ordinal=0;
  while((m=txRe.exec(cleaned))){
    const txid=m[1]==='-'?'':m[1];
    const before=cleaned.slice(Math.max(0,m.index-900),m.index);
    const dateMatches=[...before.matchAll(/20\d{2}\/\d{2}\/\d{2}\s+\d{2}:\d{2}/g)];
    const amountMatches=[...before.matchAll(/([\d,]+(?:\.\d+)?)\s+([A-Za-z0-9]+)(?:\s*\([^)]*\))?\s*を入金しました/g)];
    const walletMatches=[...before.matchAll(/受信Walletアドレス\s*:\s*([^\s]+)/g)];
    const tagMatches=[...before.matchAll(/受信宛先タグ\s*:\s*([^\s]+)/g)];
    const dateRaw=dateMatches.at(-1)?.[0]||'';
    const amountMatch=amountMatches.at(-1);
    const wallet=walletMatches.at(-1)?.[1]||'';
    if(!dateRaw || !amountMatch || !wallet) continue;
    const amount=String(amountMatch[1]).replaceAll(',','');
    const asset=normalizeIzkyAsset(amountMatch[2]);
    const d=new Date(dateRaw.replace(/\//g,'-').replace(' ','T')+':00+09:00');
    const excerptStart=Math.max(0, before.lastIndexOf(dateRaw));
    const sourceExcerpt=(before.slice(excerptStart)+cleaned.slice(m.index,txRe.lastIndex)).trim().slice(0,1400);
    ordinal++;
    rows.push({
      recordId:'IZKY-PDF-P'+pageNumber+'-'+String(ordinal).padStart(3,'0'),
      timestamp:Number.isNaN(d.getTime())?null:Math.floor(d.getTime()/1000),
      dateRaw,
      asset,amount,txid,
      destinationAddress:wallet,
      destinationTag:tagMatches.at(-1)?.[1]||'',
      sourceType:'PDF',
      sourceFileName:sourceName,
      sourcePdfSha256:pdfSha,
      sourcePage:pageNumber,
      sourceExcerpt,
      raw:{page:pageNumber,text:sourceExcerpt}
    });
  }
  return rows;
}
function parseIzkyDepositDocument(pages,sourceName,pdfSha){
  // PDF.js can split Japanese text into many fragments with arbitrary spaces.
  // Build a whitespace-free forensic parsing stream while keeping original page text for excerpts.
  let compact='',pageRanges=[];let offset=0;
  for(const p of pages){
    const c=String(p.text||'').replace(/\s+/g,'');
    pageRanges.push({page:p.page,start:offset,end:offset+c.length,original:p.text||''});
    compact+=c;offset=compact.length;
  }
  const pageForPos=pos=>pageRanges.find(r=>pos>=r.start&&pos<r.end)?.page||pageRanges.at(-1)?.page||1;
  const rows=[];
  const dateRe=/20\d{2}\/\d{2}\/\d{2}\d{2}:\d{2}/g;
  const dates=[...compact.matchAll(dateRe)];
  for(let i=0;i<dates.length;i++){
    const dm=dates[i],dateCompact=dm[0],segStart=dm.index;
    const segEnd=i+1<dates.length?dates[i+1].index:Math.min(compact.length,segStart+2200);
    const seg=compact.slice(segStart,segEnd);
    if(!seg.includes('を入金しました')) continue;
    const amt=seg.match(/([\d,]+(?:\.\d+)?)([A-Za-z0-9]+)(?:\([^)]*\))?を入金しました/);
    if(!amt) continue;
    const wallet=(seg.match(/受信Walletアドレス:([^\[\]]+?)(?=受信宛先タグ:|TxID:|CryptoPanda|20\d{2}\/|$)/)||[])[1]||'';
    const tag=(seg.match(/受信宛先タグ:([^\[\]]+?)(?=TxID:|20\d{2}\/|$)/)||[])[1]||'';
    const txRaw=(seg.match(/TxID:([^\[\]]+?)(?=20\d{2}\/|$)/)||[])[1]||'';
    const exchangeDirect=seg.includes('CryptoPandaで交換を行いました');
    const page=pageForPos(segStart);
    const dateRaw=dateCompact.slice(0,10)+' '+dateCompact.slice(10);
    const d=new Date(dateRaw.replace(/\//g,'-').replace(' ','T')+':00+09:00');
    const amount=String(amt[1]).replaceAll(',','');
    const asset=normalizeIzkyAsset(amt[2]);
    const original=pageRanges.find(r=>r.page===page)?.original||'';
    rows.push({
      recordId:'IZKY-PDF-P'+page+'-'+String(rows.length+1).padStart(3,'0'),
      timestamp:Number.isNaN(d.getTime())?null:Math.floor(d.getTime()/1000),
      dateRaw,asset,amount,
      txid:txRaw==='-'?'':txRaw,
      destinationAddress:wallet,
      destinationTag:tag,
      sourceType:'PDF',
      sourceFileName:sourceName,
      sourcePdfSha256:pdfSha,
      sourcePage:page,
      sourceExcerpt:original.slice(0,1800),
      sourceRoute:exchangeDirect?'CRYPTOPANDA_EXCHANGE_RECORDED':'ONCHAIN_DEPOSIT_RECORDED',
      raw:{page,compactSegment:seg.slice(0,1800)}
    });
  }
  return rows;
}
function rebuildPdfVisualText(items){
  const words=[];
  for(const item of items||[]){
    if(!item||typeof item.str!=='string'||!item.str) continue;
    const t=item.transform||[];
    words.push({text:item.str,x:Number(t[4]||0),y:Number(t[5]||0)});
  }
  words.sort((a,b)=>{
    const dy=b.y-a.y;
    if(Math.abs(dy)>2.5) return dy;
    return a.x-b.x;
  });
  const lines=[];let current=[],lineY=null;
  for(const w of words){
    if(lineY==null||Math.abs(w.y-lineY)<=2.5){
      current.push(w); if(lineY==null) lineY=w.y;
    }else{
      current.sort((a,b)=>a.x-b.x);
      lines.push(current.map(x=>x.text).join(' '));
      current=[w];lineY=w.y;
    }
  }
  if(current.length){current.sort((a,b)=>a.x-b.x);lines.push(current.map(x=>x.text).join(' '));}
  return lines.join('\n');
}
async function parsePdfLedgerFile(file){
  const buffer=await file.arrayBuffer();
  const pdfSha=await sha256Bytes(buffer.slice(0));
  const pdfjs=await loadPdfJs();
  const doc=await pdfjs.getDocument({data:new Uint8Array(buffer)}).promise;
  const pages=[];
  for(let p=1;p<=doc.numPages;p++){
    const page=await doc.getPage(p);
    const content=await page.getTextContent();
    const text=rebuildPdfVisualText(content.items);
    pages.push({page:p,text});
  }
  const rows=parseIzkyDepositDocument(pages,file.name,pdfSha);
  const allText=pages.map(x=>x.text).join('\n');
  return {rows,meta:{
    sourceType:'PDF',sourceFileName:file.name,sourcePdfSha256:pdfSha,pageCount:doc.numPages,
    parsedRecordCount:rows.length,pagesWithText:pages.filter(x=>x.text.trim()).length,
    textChars:allText.length,
    containsDepositPhrase:allText.replace(/\s+/g,'').includes('を入金しました'),
    containsTxId:/TxID/i.test(allText),
    containsWallet:/受信\s*Wallet\s*アドレス/i.test(allText),
    diagnosticPreview:allText.slice(0,600)
  }};
}
function parseCsvLine(line){
  const out=[];let cur='',q=false;
  for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(c===','&&!q){out.push(cur);cur='';}else cur+=c;}out.push(cur);return out;
}
function normalizeLedgerRow(row,index){
  const obj={};for(const [k,v] of Object.entries(row||{}))obj[String(k).trim().toLowerCase()]=v;
  const dateRaw=obj.timestamp??obj.datetime??obj['date/time']??obj.date??obj.time??'';
  let ts=null;
  if(typeof dateRaw==='number')ts=dateRaw>1e12?Math.floor(dateRaw/1000):Math.floor(dateRaw);
  else if(String(dateRaw).trim()){const d=new Date(String(dateRaw).trim());if(!Number.isNaN(d.getTime()))ts=Math.floor(d.getTime()/1000);}
  return {
    recordId:String(obj.id??obj.record_id??obj['record id']??('IZKY-ROW-'+String(index+1).padStart(4,'0'))),
    timestamp:ts,
    dateRaw:String(dateRaw??''),
    asset:String(obj.asset??obj.currency??obj.coin??obj.token??'').trim().toUpperCase(),
    amount:String(obj.amount??obj.quantity??obj.value??'').trim(),
    txid:String(obj.txid??obj.tx_hash??obj.hash??obj.transaction_hash??'').trim(),
    raw:row
  };
}
async function parseLedgerFile(file){
  if(file.name.toLowerCase().endsWith('.pdf')||file.type==='application/pdf'){
    const result=await parsePdfLedgerFile(file);
    importedSourceMeta=result.meta;
    return result.rows;
  }
  const text=await file.text();
  importedSourceMeta={sourceType:file.name.toLowerCase().endsWith('.json')?'JSON':'CSV',sourceFileName:file.name,sourceSha256:await sha256(text)};
  if(file.name.toLowerCase().endsWith('.json')||text.trim().startsWith('[')||text.trim().startsWith('{')){
    const parsed=JSON.parse(text);const rows=Array.isArray(parsed)?parsed:(parsed.records||parsed.transactions||parsed.data||[]);
    if(!Array.isArray(rows))throw new Error('JSON内の取引配列を認識できません。');
    return rows.map(normalizeLedgerRow);
  }
  const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.trim());
  if(lines.length<2)return [];
  const headers=parseCsvLine(lines[0]).map(h=>h.trim());
  return lines.slice(1).map((line,i)=>{const vals=parseCsvLine(line),row={};headers.forEach((h,j)=>row[h]=vals[j]??'');return normalizeLedgerRow(row,i);});
}
function amountClose(a,b){
  try{
    const x=Number(a),y=Number(b);
    if(!Number.isFinite(x)||!Number.isFinite(y))return String(a)===String(b);
    const tol=Math.max(1e-10,Math.abs(y)*1e-8);
    return Math.abs(x-y)<=tol;
  }catch{return String(a)===String(b);}
}
function assetEquivalent(a,b){
  const x=String(a||'').toUpperCase(),y=String(b||'').toUpperCase();
  if(x===y)return true;
  const aliases={WETH:'ETH',WBTC:'BTC',POL:'MATIC',MATIC:'POL'};
  return aliases[x]===y||aliases[y]===x;
}
function reconcileLedger(){
  const tolMin=Number($('timeTolerance').value)||0,tol=tolMin*60;
  return importedLedger.map(row=>{
    let candidate=null,method='none';
    if(row.txid){
      candidate=sessionEvidencePool.find(r=>String(r.txid).toLowerCase()===row.txid.toLowerCase());
      if(candidate)method='txid_exact';
    }
    if(!candidate){
      const possible=sessionEvidencePool.filter(r=>assetEquivalent(row.asset,r.asset)&&amountClose(row.amount,r.amount)&&
        (row.timestamp==null||r.timestamp==null||Math.abs(row.timestamp-r.timestamp)<=tol));
      if(possible.length===1){candidate=possible[0];method='asset_amount_time';}
      else if(possible.length>1){return {...row,status:'AMBIGUOUS_MATCH',reason:possible.length+' candidate on-chain transfers match asset/amount/time window.',candidates:possible.map(x=>x.evidenceId)};}
    }
    if(candidate)return {...row,status:'SELF_WALLET_CONFIRMED',reason:method==='txid_exact'?'IZAKA-YA record TxID exactly matches a confirmed self-wallet transfer.':'Asset, amount and time match one confirmed self-wallet transfer within tolerance.',matchedEvidenceId:candidate.evidenceId,matchedTxid:candidate.txid,matchedFrom:candidate.from,matchedTo:candidate.to};
    return {...row,status:'SOURCE_UNKNOWN',reason:'No matching transfer was found in the self-wallet evidence scanned in this browser session. This does not by itself prove an exchange/direct-service origin.'};
  });
}
function renderReconciliation(){
  const rows=$('reconRows'); if(!rows)return;rows.innerHTML='';
  for(const r of reconciliationResults){const tr=document.createElement('tr');tr.innerHTML=
    '<td>'+esc(r.recordId)+'</td><td>'+esc(r.timestamp?new Date(r.timestamp*1000).toLocaleString('ja-JP'):r.dateRaw||'—')+'</td><td>'+esc(r.asset)+'</td><td>'+esc(r.amount)+'</td><td><span class="pill">'+esc(r.status)+'</span></td><td>'+esc(r.reason)+(r.matchedEvidenceId?'<br><code>'+esc(r.matchedEvidenceId)+'</code>':'')+'</td>';rows.appendChild(tr);}
  const counts={};for(const r of reconciliationResults)counts[r.status]=(counts[r.status]||0)+1;
  $('reconSummary').textContent=reconciliationResults.length+' record(s): '+Object.entries(counts).map(([k,v])=>k+' '+v).join(' / ');
  $('reconDetails').innerHTML=reconciliationResults.length?'<h2>Reconciliation methodology</h2><p class="muted">SELF_WALLET_CONFIRMED = TxID exact match, or unique asset/amount/time match against evidence scanned in this browser session. SOURCE_UNKNOWN = no self-wallet match found; exchange/direct-service origin remains an investigative hypothesis until supported by exchange withdrawal records or other primary evidence.</p>':'';
}

function render(){const rows=$('rows');rows.innerHTML='';for(const r of matches){const tr=document.createElement('tr');tr.innerHTML=`<td>${esc(r.timestamp?new Date(r.timestamp*1000).toLocaleString('ja-JP'):'—')}</td><td>${esc(r.network)}</td><td>${esc(r.asset)}</td><td>${esc(r.amount)}</td><td><code>${esc(r.to)}</code></td><td><code>${esc(r.txid)}</code></td><td>${esc(r.classification)}</td><td>${esc((r.evidenceRefs||[]).join(', '))}</td>`;rows.appendChild(tr);}$('summary').textContent=matches.length+' matched transfer(s).';renderReportMeta();renderEvidenceDetails();}
function init(){ $('network').innerHTML=EVM_CHAINS.map(c=>`<option value="${c.chainId}">${c.name}</option>`).join('');
 const update=()=>{const k=$('kind').value;$('networkWrap').style.display='block';$('network').disabled=k!=='evm';$('networkWrap').style.opacity=k==='evm'?'1':'0.55';$('keyWrap').style.display=k==='evm'?'block':'none';$('rpcWrap').style.display=(k==='sol'||k==='xrp')?'block':'none';};$('kind').addEventListener('change',update);update();
 $('scan').onclick=async()=>{const address=$('addr').value.trim();if(!address)return alert('Public addressを入力してください。');$('status').textContent='Scanning…';try{const req={address,apiKey:$('key').value.trim(),rpcUrl:$('rpc').value.trim()||undefined,network:$('network').value,maxRecords:Number($('max').value)||200};let rec=[];if($('kind').value==='btc')rec=await scanBitcoin(req);if($('kind').value==='evm')rec=await scanEvm(req);if($('kind').value==='sol')rec=await scanSolana(req);if($('kind').value==='xrp')rec=await scanXrp(req);scanRetrievedAt=new Date().toISOString();matches=matchTransfers(rec);matches=await enrichEvidenceRecords(matches);addToSessionPool(matches);const c=EVM_CHAINS.find(x=>x.chainId===req.network);lastMeta={scannedAddress:address,sourceRecordCount:rec.length,caseProfileVersion:knownProfile.version,caseProfileSha256:await sha256(JSON.stringify(knownProfile)),retrievedAt:scanRetrievedAt,networkName:($('kind').value==='evm'&&c)?c.name:($('kind').value==='btc'?'Bitcoin':$('kind').value==='sol'?'Solana':'XRP Ledger')};render();$('status').textContent='Completed. '+rec.length+' outgoing candidate(s) inspected; '+matches.length+' matched.';}catch(e){$('status').textContent='Error: '+e.message;}};
 $('json').onclick=()=>download(exportBaseName()+'.json',JSON.stringify({meta:lastMeta,records:matches},null,2),'application/json');
 $('print').onclick=()=>{
  const oldTitle=document.title;
  document.title=exportBaseName();
  const restore=()=>{document.title=oldTitle;window.removeEventListener('afterprint',restore);};
  window.addEventListener('afterprint',restore);
  window.print();
  setTimeout(()=>{ if(document.title!==oldTitle) document.title=oldTitle; },1500);
};

 const ledgerFile=$('ledgerFile');
 if(ledgerFile) ledgerFile.addEventListener('change',async()=>{
   try{
     const file=ledgerFile.files&&ledgerFile.files[0];
     if(!file){importedLedger=[];$('reconStatus').textContent='No IZAKA-YA records loaded.';return;}
     $('reconStatus').textContent='Reading '+file.name+' locally…';
     importedLedger=await parseLedgerFile(file);
     $('reconStatus').textContent='Extracted records: '+importedLedger.length+
       ' | Source: '+(importedSourceMeta?.sourceType||'file')+
       (importedSourceMeta?.sourcePdfSha256?' | PDF SHA-256: '+importedSourceMeta.sourcePdfSha256:'')+
       (importedSourceMeta?.sourceType==='PDF'?' | pages: '+(importedSourceMeta?.pageCount??'?')+
        ' | text chars: '+(importedSourceMeta?.textChars??'?')+
        ' | deposit phrase: '+String(importedSourceMeta?.containsDepositPhrase??false)+
        ' | TxID: '+String(importedSourceMeta?.containsTxId??false)+
        ' | Wallet label: '+String(importedSourceMeta?.containsWallet??false):'')+
       ' | Nothing uploaded to a server.';
   }catch(e){importedLedger=[];$('reconStatus').textContent='Import error: '+e.message;}
 });
 if($('reconcile')) $('reconcile').onclick=async()=>{
   if(!importedLedger.length){
     const file=$('ledgerFile')?.files?.[0];
     if(file){
       $('reconStatus').textContent='Reading '+file.name+' locally…';
       try{
         importedLedger=await parseLedgerFile(file);
         $('reconStatus').textContent='Extracted records: '+importedLedger.length+
           ' | Source: '+(importedSourceMeta?.sourceType||'file')+
           (importedSourceMeta?.sourcePdfSha256?' | PDF SHA-256: '+importedSourceMeta.sourcePdfSha256:'')+
           ' | text chars: '+(importedSourceMeta?.textChars??'?')+
           ' | deposit phrase: '+String(importedSourceMeta?.containsDepositPhrase??false)+
           ' | TxID: '+String(importedSourceMeta?.containsTxId??false)+
           ' | Wallet label: '+String(importedSourceMeta?.containsWallet??false);
       }catch(e){
         $('reconStatus').textContent='PDF import error: '+e.message;
         return alert('PDFの読み取りに失敗しました: '+e.message);
       }
     }
   }
   if(!importedLedger.length)return alert('PDFは選択されていますが、入金記録を抽出できませんでした。画面のImport statusを確認してください。');
   reconciliationResults=reconcileLedger();renderReconciliation();
 };
 if($('exportRecon')) $('exportRecon').onclick=()=>{
   download('EvidenceTracer-Reconciliation-'+exportChainLabel()+'.json',JSON.stringify({
     generatedAt:new Date().toISOString(),
     sessionEvidenceCount:sessionEvidencePool.length,
     source:importedSourceMeta,
     methodology:{confirmed:'TxID exact or unique asset/amount/time match against self-wallet evidence in this browser session',unknown:'No self-wallet match found; exchange/direct-service origin not proven'},
     records:reconciliationResults
   },null,2),'application/json');
 };

 $('clear').onclick=()=>{matches=[];lastMeta={};scanRetrievedAt=null;sessionEvidencePool=[];importedLedger=[];reconciliationResults=[];importedSourceMeta=null;$('addr').value='';$('key').value='';$('rpc').value='';render();$('status').textContent='Cleared from page memory.';};
}
window.addEventListener('DOMContentLoaded',()=>{try{init();document.body.dataset.appReady='true';}catch(e){document.getElementById('boot-error').textContent='Application error: '+e.message;document.getElementById('boot-error').style.display='block';}});
