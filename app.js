
const EVM_CHAINS=[
{name:'Ethereum',chainId:'1',symbol:'ETH'},{name:'BNB Smart Chain',chainId:'56',symbol:'BNB'},{name:'Polygon',chainId:'137',symbol:'POL'},{name:'Arbitrum One',chainId:'42161',symbol:'ETH'},{name:'OP Mainnet',chainId:'10',symbol:'ETH'},{name:'Base',chainId:'8453',symbol:'ETH'},{name:'Avalanche C-Chain',chainId:'43114',symbol:'AVAX'},{name:'Linea',chainId:'59144',symbol:'ETH'},{name:'Scroll',chainId:'534352',symbol:'ETH'},{name:'zkSync Era',chainId:'324',symbol:'ETH'},{name:'HyperEVM',chainId:'999',symbol:'HYPE'},{name:'opBNB',chainId:'204',symbol:'BNB'}];
let matches=[],lastMeta={};
let sessionEvidencePool=[];
let sessionScannedWallets=[];
let importedLedger=[];
let reconciliationResults=[];
let importedSourceMeta=null;
let scanRetrievedAt=null;
const TRACE_STORE_KEY='evidenceTracer.traceCache.v1';
function safeLoadTraceCache(){
  try{
    const raw=localStorage.getItem(TRACE_STORE_KEY);
    if(!raw)return {version:1,wallets:[],evidence:[]};
    const j=JSON.parse(raw);
    return {
      version:1,
      wallets:Array.isArray(j.wallets)?j.wallets:[],
      evidence:Array.isArray(j.evidence)?j.evidence:[]
    };
  }catch{return {version:1,wallets:[],evidence:[]};}
}
function saveTraceCache(){
  const payload={
    version:1,
    savedAt:new Date().toISOString(),
    wallets:sessionScannedWallets,
    evidence:sessionEvidencePool.map(r=>{
      const copy={...r};
      delete copy.raw;
      return copy;
    })
  };
  localStorage.setItem(TRACE_STORE_KEY,JSON.stringify(payload));
  renderTraceCacheStatus();
}
function restoreTraceCache(){
  const c=safeLoadTraceCache();
  sessionScannedWallets=[...c.wallets];
  sessionEvidencePool=[...c.evidence];
  renderTraceCacheStatus();
  return c;
}
function clearTraceCache(){
  localStorage.removeItem(TRACE_STORE_KEY);
  sessionScannedWallets=[];
  sessionEvidencePool=[];
  renderTraceCacheStatus();
}
function exportTraceCache(){
  const c=safeLoadTraceCache();
  download('EvidenceTracer-TraceCache.json',JSON.stringify(c,null,2),'application/json');
}
async function importTraceCacheFile(file){
  const text=await file.text();
  const j=JSON.parse(text);
  if(!j||!Array.isArray(j.wallets)||!Array.isArray(j.evidence))throw new Error('Invalid trace cache file.');
  sessionScannedWallets=[...j.wallets];
  sessionEvidencePool=[...j.evidence];
  saveTraceCache();
  return {wallets:sessionScannedWallets.length,evidence:sessionEvidencePool.length};
}
function renderTraceCacheStatus(){
  const el=$('traceCacheStatus');
  if(!el)return;
  const c=safeLoadTraceCache();
  el.textContent='Saved trace cache: '+c.wallets.length+' wallet(s) / '+c.evidence.length+' evidence record(s). API keys and private keys are never stored.';
}

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
async function scanEvm(req){if(req.network==='8453')throw new Error('Baseの全アドレス履歴スキャンは公開RPCだけでは列挙できません。下のPDF入金照合で「Resolve Base sources from TxID」を使用してください。Etherscan有料プランは不要です。');if(!req.apiKey)throw new Error('Etherscan API keyが必要です。ブラウザメモリにのみ保持されます。');const c=EVM_CHAINS.find(x=>x.chainId===req.network);const base={chainid:c.chainId,module:'account',address:req.address,startblock:'0',endblock:'999999999',page:'1',offset:String(req.maxRecords||200),sort:'asc',apikey:req.apiKey};const [normal,token]=await Promise.all([evmQuery({...base,action:'txlist'}),evmQuery({...base,action:'tokentx'})]);const a=req.address.toLowerCase(),out=[];for(const t of normal){if(String(t.from).toLowerCase()!==a||!t.to)continue;out.push({chain:'evm',network:c.name,txid:t.hash,timestamp:Number(t.timeStamp),from:t.from,to:t.to,asset:c.symbol,amount:units(t.value,18),status:t.isError==='0'?'confirmed':'unknown',raw:t});}for(const t of token){if(String(t.from).toLowerCase()!==a||!t.to)continue;out.push({chain:'evm',network:c.name,txid:t.hash,timestamp:Number(t.timeStamp),from:t.from,to:t.to,asset:t.tokenSymbol||'TOKEN',amount:units(t.value,t.tokenDecimal),status:'confirmed',raw:t});}return out;}
async function rpc(url,method,params){const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});if(!r.ok){
  let detail='';
  try{detail=' '+await r.text();}catch{}
  throw new Error('RPC HTTP '+r.status+detail.slice(0,180));
}const j=await r.json();if(j.error)throw new Error(j.error.message);return j.result;}
const BASE_MAINNET_RPC='https://mainnet.base.org';
const ERC20_TRANSFER_TOPIC='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
function evmTopicAddress(topic){
  const t=String(topic||'').toLowerCase();
  return /^0x[0-9a-f]{64}$/.test(t)?('0x'+t.slice(-40)):null;
}
function hexToDecimalString(hex,decimals=0){
  if(!hex||hex==='0x')return '0';
  let n=BigInt(hex),d=Number(decimals||0);
  let str=n.toString();
  if(!d)return str;
  str=str.padStart(d+1,'0');
  const a=str.slice(0,-d),b=str.slice(-d).replace(/0+$/,'');
  return b?a+'.'+b:a;
}
async function baseTokenDecimals(contract){
  try{
    const result=await rpc(BASE_MAINNET_RPC,'eth_call',[{to:contract,data:'0x313ce567'},'latest']);
    return Number(BigInt(result));
  }catch{return null;}
}
async function resolveBaseTxSource(row){
  const expectedTo=String(row.destinationAddress||'').toLowerCase();
  if(!/^0x[0-9a-f]{40}$/.test(expectedTo))throw new Error('Invalid/missing EVM destination address in imported record.');
  const tx=await rpc(BASE_MAINNET_RPC,'eth_getTransactionByHash',[row.txid]);
  if(!tx) return null; // Tx is not on Base.
  const receipt=await rpc(BASE_MAINNET_RPC,'eth_getTransactionReceipt',[row.txid]);
  if(!receipt)throw new Error('Base receipt not found.');
  if(receipt.status!=='0x1')throw new Error('Base transaction receipt is not successful.');

  // Native ETH transfer directly to the IZAKA-YA deposit address.
  if(String(tx.to||'').toLowerCase()===expectedTo && BigInt(tx.value||'0x0')>0n && String(row.asset||'').toUpperCase()==='ETH' && amountClose(hexToDecimalString(tx.value,18),row.amount)){
    return {
      network:'Base',sourceAddress:String(tx.from||'').toLowerCase(),
      txSender:String(tx.from||'').toLowerCase(),destinationAddress:expectedTo,
      amount:hexToDecimalString(tx.value,18),asset:'ETH',
      method:'BASE_NATIVE_TX',blockNumber:parseInt(tx.blockNumber||'0x0',16),
      status:receipt.status,resolvedAt:new Date().toISOString(),rpcUrl:BASE_MAINNET_RPC
    };
  }

  // ERC-20 Transfer(address,address,uint256) logs.
  for(const log of receipt.logs||[]){
    const topics=log.topics||[];
    if(String(topics[0]||'').toLowerCase()!==ERC20_TRANSFER_TOPIC || topics.length<3)continue;
    const to=evmTopicAddress(topics[2]);
    if(String(to||'').toLowerCase()!==expectedTo)continue;
    const from=evmTopicAddress(topics[1]);
    const decimals=await baseTokenDecimals(log.address);
    if(decimals==null||!Number.isInteger(decimals)||decimals<0||decimals>36)throw new Error('Cannot verify token decimals for Base Transfer log.');
    const amount=hexToDecimalString(log.data,decimals);
    if(!amountClose(amount,row.amount))continue;
    const symbolHex=await rpc(BASE_MAINNET_RPC,'eth_call',[{to:log.address,data:'0x95d89b41'},'latest']).catch(()=>null);
    let tokenSymbol='';
    if(symbolHex){try{const bytes=String(symbolHex).slice(2);const n=Number.parseInt(bytes.slice(64,128),16);const off=Number.parseInt(bytes.slice(0,64),16)*2;tokenSymbol=decodeURIComponent(bytes.slice(off+64,off+64+n*2).replace(/../g,'%const amount=decimals==null?BigInt(log.data||'0x0').toString():hexToDecimalString(log.data,decimals);
    return {')).replace(/\0/g,'');}catch{}}
    if(tokenSymbol&&tokenSymbol.toUpperCase()!==String(row.asset||'').toUpperCase())continue;
    return {
      network:'Base',sourceAddress:from,txSender:String(tx.from||'').toLowerCase(),
      destinationAddress:expectedTo,tokenContract:String(log.address||'').toLowerCase(),
      tokenDecimals:decimals,amount,asset:row.asset||'TOKEN',tokenSymbol:tokenSymbol||null,
      method:tokenSymbol?'BASE_ERC20_TRANSFER_LOG':'BASE_ERC20_TRANSFER_LOG_SYMBOL_UNVERIFIED',blockNumber:parseInt(tx.blockNumber||'0x0',16),
      status:receipt.status,resolvedAt:new Date().toISOString(),rpcUrl:BASE_MAINNET_RPC
    };
  }
  throw new Error('Transaction exists on Base, but no transfer to the imported IZAKA-YA destination was found.');
}
async function resolveUnknownBaseSources(){
  if(!reconciliationResults.length)throw new Error('Run reconciliation first.');
  const targets=reconciliationResults.filter(r=>/^0x[0-9a-fA-F]{64}$/.test(String(r.txid||''))&&r.status!=='SELF_WALLET_CONFIRMED');
  let checked=0,resolved=0,self=0,notBase=0,failed=0;
  for(let i=0;i<targets.length;i++){
    const r=targets[i];checked++;
    $('baseResolveStatus').textContent='Checking Base TxID '+(i+1)+' / '+targets.length+'…';
    try{
      const info=await resolveBaseTxSource(r);
      if(!info){notBase++;continue;}
      r.onchainNetwork='Base';
      r.onchainSourceAddress=info.sourceAddress;
      r.onchainTxSender=info.txSender;
      r.onchainDestinationAddress=info.destinationAddress;
      r.onchainResolvedAmount=info.amount;
      r.onchainTokenContract=info.tokenContract||'';
      r.onchainTokenDecimals=info.tokenDecimals;
      r.sourceResolutionMethod=info.method;
      r.sourceResolutionConfidence=info.ambiguous?'AMBIGUOUS':'PARSED_TRANSFER';
      delete r.sourceResolutionError;
      r.sourceResolvedAt=info.resolvedAt;
      r.onchainBlock=info.blockNumber;
      r.sourceRpc=info.rpcUrl;
      const own=sessionScannedWallets.some(w=>w.chain==='evm'&&String(w.address).toLowerCase()===String(info.sourceAddress).toLowerCase()) && info.method!=='BASE_ERC20_TRANSFER_LOG_SYMBOL_UNVERIFIED';
      if(own){
        r.status='SELF_WALLET_CONFIRMED';
        r.reason='PDF TxID resolved on Base to a source address matching an EVM wallet already confirmed in this browser session.';
        self++;
      }else{
        r.status='ONCHAIN_SOURCE_RESOLVED';
        r.reason='PDF TxID was found on Base and a transfer to the IZAKA-YA destination was verified. Source address identified; legal ownership/exchange attribution is not established.';
      }
      resolved++;
    }catch(e){
      r.baseResolutionError=e.message;
      failed++;
    }
    renderReconciliation();
  }
  return {checked,resolved,self,notBase,failed};
}

function solanaRpcEndpoints(custom){
  // User-selected endpoint is tried first, with public fallbacks if unavailable.
  // None of the shared public services guarantees historical RPC access.
  return [...new Set([
    ...(custom?[custom]:[]),
    'https://solana-rpc.publicnode.com',
    'https://public-solana-mainnet.rpcnode.dev',
    'https://rpc.nodeflare.app/solana/public',
    'https://api.mainnet.solana.com'
  ])];
}
function rememberScannedWallet(chain,address,network){
  const a=String(address||'').trim();
  if(!a)return;
  if(!sessionScannedWallets.some(x=>x.chain===chain&&x.address===a)){
    sessionScannedWallets.push({chain,address:a,network:network||'',scannedAt:new Date().toISOString()});
  }
}
function solanaKeys(tx){
  return (tx?.transaction?.message?.accountKeys||[]).map(k=>typeof k==='string'?{pubkey:k}:{pubkey:k?.pubkey||'',signer:!!k?.signer,writable:!!k?.writable});
}
function extractSolanaSource(tx,row){
  const expectedTo=String(row.destinationAddress||'');
  const expectedAmount=Number(row.amount||0);
  const groups=[
    ...(tx?.transaction?.message?.instructions||[]),
    ...((tx?.meta?.innerInstructions||[]).flatMap(g=>g.instructions||[]))
  ];
  for(const i of groups){
    const p=i?.parsed;
    if(p&&p.type==='transfer'&&p.info?.source&&p.info?.destination===expectedTo&&p.info?.lamports!=null){
      const amt=Number(p.info.lamports)/1e9;
      if(!Number.isFinite(expectedAmount)||amountClose(amt,expectedAmount)){
        return {sourceAddress:p.info.source,destinationAddress:p.info.destination,amount:String(amt),method:'PARSED_SYSTEM_TRANSFER'};
      }
    }
  }
  const keys=solanaKeys(tx);
  const pre=tx?.meta?.preBalances||[],post=tx?.meta?.postBalances||[];
  const destIndex=keys.findIndex(k=>k.pubkey===expectedTo);
  if(destIndex<0)return null;
  const destDelta=(Number(post[destIndex]||0)-Number(pre[destIndex]||0))/1e9;
  const negatives=[];
  for(let i=0;i<keys.length;i++){
    if(i===destIndex||pre[i]==null||post[i]==null)continue;
    const delta=(Number(post[i])-Number(pre[i]))/1e9;
    if(delta<0)negatives.push({address:keys[i].pubkey,delta,signer:keys[i].signer,writable:keys[i].writable});
  }
  negatives.sort((a,b)=>(Number(b.signer)-Number(a.signer))||(Math.abs(b.delta)-Math.abs(a.delta)));
  const src=negatives[0];
  if(!src)return null;
  return {sourceAddress:src.address,destinationAddress:expectedTo,amount:String(destDelta),method:'BALANCE_DELTA',sourceDelta:String(src.delta)};
}
async function resolveSolanaTxSource(row,customRpc){
  const failures=[];
  for(const url of solanaRpcEndpoints(customRpc)){
    try{
      const tx=await rpc(url,'getTransaction',[row.txid,{encoding:'jsonParsed',commitment:'finalized',maxSupportedTransactionVersion:0}]);
      if(!tx){failures.push(url+': null (not indexed or unavailable)');continue;}
      if(tx.meta?.err)throw new Error('Transaction failed on-chain: '+JSON.stringify(tx.meta.err));
      const resolved=extractSolanaSource(tx,row);
      if(!resolved)throw new Error('Destination transfer cannot be verified');
      if(resolved.method==='BALANCE_DELTA'){
        // A balance difference can have many causes; don't identify a legal sender from it.
        return {...resolved,ambiguous:true,rpcUrl:url,block:tx.slot,timestamp:tx.blockTime,resolvedAt:new Date().toISOString()};
      }
      return {...resolved,ambiguous:false,rpcUrl:url,block:tx.slot,timestamp:tx.blockTime,resolvedAt:new Date().toISOString()};
    }catch(e){failures.push(url+': '+String(e.message).slice(0,180));}
  }
  throw new Error('No usable Solana RPC response. '+failures.join(' | ').slice(0,950)+'. A dedicated archive RPC may be required.');
}
async function resolveUnknownSolanaSources(){
  if(!reconciliationResults.length)throw new Error('Run reconciliation first.');
  const targets=reconciliationResults.filter(r=>r.asset==='SOL'&&r.txid&&r.status!=='SELF_WALLET_CONFIRMED');
  if(!targets.length)return {attempted:0,resolved:0,self:0,failed:0};
  const custom=$('rpc')?.value.trim()||undefined;
  let resolved=0,self=0,failed=0;
  for(let i=0;i<targets.length;i++){
    const r=targets[i];
    $('sourceResolveStatus').textContent='Resolving SOL '+(i+1)+' / '+targets.length+'…';
    try{
      const info=await resolveSolanaTxSource(r,custom);
      r.onchainSourceAddress=info.sourceAddress;
      r.onchainDestinationAddress=info.destinationAddress;
      r.onchainResolvedAmount=info.amount;
      r.sourceResolutionMethod=info.method;
      r.sourceResolutionConfidence=info.method==='BASE_ERC20_TRANSFER_LOG_SYMBOL_UNVERIFIED'?'SYMBOL_UNVERIFIED':'ONCHAIN_VERIFIED';
      delete r.baseResolutionError;
      r.sourceResolvedAt=info.resolvedAt;
      r.onchainBlock=info.block;
      r.onchainTimestamp=info.timestamp;
      r.sourceRpc=info.rpcUrl;
      const own=!info.ambiguous && sessionScannedWallets.some(w=>w.chain==='sol'&&w.address===info.sourceAddress);
      if(own){
        r.status='SELF_WALLET_CONFIRMED';
        r.reason='PDF TxID resolved on-chain to a source address that matches a SOL wallet scanned in this browser session.';
        self++;
      }else{
        r.status=info.ambiguous?'UNRESOLVED':'ONCHAIN_SOURCE_RESOLVED';
        r.reason=info.ambiguous?'Balance delta suggests an address but no parsed transfer uniquely verifies the source. Manual review required.':'PDF TxID and parsed System transfer resolved on-chain. Ownership/account attribution is not established.';
      }
      resolved++;
    }catch(e){
      r.sourceResolutionError=e.message;
      failed++;
    }
    renderReconciliation();
  }
  return {attempted:targets.length,resolved,self,failed};
}
async function scanSolana(req){
  const endpoints=solanaRpcEndpoints(req.rpcUrl);
  let lastErr=null;
  for(const url of endpoints){
    try{
      const sigs=await rpc(url,'getSignaturesForAddress',[req.address,{limit:Math.min(req.maxRecords||100,1000),commitment:'finalized'}]);
      const out=[];
      for(const sig of sigs){
        const tx=await rpc(url,'getTransaction',[sig.signature,{encoding:'jsonParsed',commitment:'finalized',maxSupportedTransactionVersion:0}]);
        if(!tx)continue;

        const rawKeys=tx.transaction?.message?.accountKeys||[];
        const keys=rawKeys.map(k=>typeof k==='string'?k:(k?.pubkey||''));
        const senderIndex=keys.findIndex(k=>k===req.address);
        const pre=tx.meta?.preBalances||[];
        const post=tx.meta?.postBalances||[];

        // Primary method: infer native SOL transfers from balance deltas.
        // This survives versioned transactions and inner instructions.
        if(senderIndex>=0 && pre[senderIndex]!=null && post[senderIndex]!=null){
          const senderDelta=Number(post[senderIndex])-Number(pre[senderIndex]);
          if(senderDelta<0){
            for(let i=0;i<keys.length;i++){
              if(i===senderIndex||!keys[i]||pre[i]==null||post[i]==null)continue;
              const delta=Number(post[i])-Number(pre[i]);
              if(delta>0){
                out.push({
                  chain:'sol',network:'Solana',txid:sig.signature,timestamp:tx.blockTime,block:tx.slot,
                  from:req.address,to:keys[i],asset:'SOL',amount:units(String(delta),9),
                  status:'finalized',detection:'balance_delta',source:'Solana JSON-RPC '+url,raw:tx
                });
              }
            }
          }
        }

        // Secondary method: parsed System Program transfers, including inner instructions.
        const instructionGroups=[
          ...(tx.transaction?.message?.instructions||[]),
          ...((tx.meta?.innerInstructions||[]).flatMap(g=>g.instructions||[]))
        ];
        for(const i of instructionGroups){
          const p=i?.parsed;
          if(p&&p.type==='transfer'&&p.info?.source===req.address&&p.info?.destination&&p.info?.lamports!=null){
            const candidate={
              chain:'sol',network:'Solana',txid:sig.signature,timestamp:tx.blockTime,block:tx.slot,
              from:req.address,to:p.info.destination,asset:'SOL',amount:units(String(p.info.lamports),9),
              status:'finalized',detection:'parsed_instruction',source:'Solana JSON-RPC '+url,raw:tx
            };
            if(!out.some(x=>x.txid===candidate.txid&&x.to===candidate.to&&x.amount===candidate.amount)) out.push(candidate);
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
    // IMPORTANT: remove the date/time prefix before amount parsing.
    // Without this, the minute digits (e.g. "14:20") can become part of
    // the amount after whitespace is removed: 170.745602 -> 20170.745602.
    const body=seg.slice(dateCompact.length);
    // Browser print headers contain a capture timestamp followed by "履歴｜IZAKA-YA".
    // They are document metadata, not transaction timestamps.
    if(body.slice(0,180).includes('履歴｜IZAKA-YA')) continue;
    if(!body.includes('を入金しました')) continue;
    const amt=body.match(/([\d,]+(?:\.\d+)?)([A-Za-z0-9]+)(?:\([^)]*\))?を入金しました/);
    if(!amt) continue;
    const wallet=(body.match(/受信Walletアドレス:([^\[\]]+?)(?=受信宛先タグ:|TxID:|CryptoPanda|20\d{2}\/|$)/)||[])[1]||'';
    const tag=(body.match(/受信宛先タグ:([^\[\]]+?)(?=TxID:|20\d{2}\/|$)/)||[])[1]||'';
    const txRaw=(body.match(/TxID:([^\[\]]+?)(?=20\d{2}\/|$)/)||[])[1]||'';
    const exchangeDirect=body.includes('CryptoPandaで交換を行いました');
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
      parseWarning:!exchangeDirect&&!wallet?'INCOMPLETE_PAGE_BOUNDARY_RECORD':null,
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
    if(row.parseWarning)return {...row,status:'UNRESOLVED',reason:'Incomplete PDF entry at page boundary: missing destination/TxID. Excluded from financial summary until reviewed.'};
    const related=sessionEvidencePool.filter(r=>r.txid&&row.txid&&String(r.txid).toLowerCase()===String(row.txid).toLowerCase());
    const consistent=r=>assetEquivalent(row.asset,r.asset)&&amountClose(row.amount,r.amount)&&
      (!row.destinationAddress||norm(r.chain,r.to)===norm(r.chain,row.destinationAddress))&&
      (!row.destinationTag||r.chain!=='xrp'||String(row.destinationTag)===String(r.destinationTag??r.raw?.tx_json?.DestinationTag??r.raw?.tx?.DestinationTag??r.raw?.DestinationTag??''));
    let candidate=null,method='none';
    if(related.length){
      const valid=related.filter(consistent);
      if(valid.length===1){candidate=valid[0];method='txid_exact_verified_fields';}
      else if(valid.length>1)return {...row,status:'AMBIGUOUS_MATCH',reason:'Multiple matching transfer records share this TxID; review individual events.'};
      else return {...row,status:'UNRESOLVED',reason:'TxID matches a trace but asset/amount/destination or XRP destination tag does not match. Manual review required.'};
    }
    if(!candidate){
      // Only promote a unique amount/time match when destination and asset also agree.
      const possible=sessionEvidencePool.filter(r=>consistent(r)&&
        row.timestamp!=null&&r.timestamp!=null&&Math.abs(row.timestamp-r.timestamp)<=tol);
      if(possible.length===1){candidate=possible[0];method='asset_amount_time_destination';}
      else if(possible.length>1)return {...row,status:'AMBIGUOUS_MATCH',reason:possible.length+' candidates match asset/amount/time/destination.',candidates:possible.map(x=>x.evidenceId)};
    }
    if(candidate)return {...row,status:'SELF_WALLET_CONFIRMED',matchMethod:method,reason:method==='txid_exact_verified_fields'?'TxID, asset, amount and destination match scanned wallet transfer (and XRP tag where present).':'Unique asset, amount, time and destination match scanned wallet transfer; no TxID match.',matchedEvidenceId:candidate.evidenceId,matchedTxid:candidate.txid,matchedFrom:candidate.from,matchedTo:candidate.to};
    return {...row,status:'SOURCE_UNKNOWN',reason:'No sufficiently matching transfer in cached/this-session wallet evidence. Exchange/direct-service origin is not established.'};
  });
}
function chainBucketForAsset(asset){
  const a=String(asset||'').toUpperCase();
  if(['BTC'].includes(a)) return 'Bitcoin';
  if(['SOL'].includes(a)) return 'Solana';
  if(['XRP'].includes(a)) return 'XRP Ledger';
  if(['ETH','USDT','USDC','SHIB','OP','IZKY','AKC','BNB','POL','MATIC','AVAX','HYPE'].includes(a)) return 'EVM / Token';
  return 'Other';
}
function addDecimalStrings(values){
  let max=0;
  const parts=values.map(v=>{
    const str=String(v??'0').replace(/,/g,'').trim();
    const neg=str.startsWith('-');
    const clean=neg?str.slice(1):str;
    const [i='0',f='']=clean.split('.');
    max=Math.max(max,f.length);
    return {neg,i:i||'0',f};
  });
  let total=0n;
  for(const p of parts){
    const n=BigInt((p.i+p.f.padEnd(max,'0')).replace(/^0+(?=\d)/,'')||'0');
    total+=p.neg?-n:n;
  }
  const neg=total<0n;if(neg)total=-total;
  let str=total.toString().padStart(max+1,'0');
  if(max){
    str=str.slice(0,-max)+'.'+str.slice(-max);
    str=str.replace(/\.0+$/,'').replace(/(\.\d*?)0+$/,'$1');
  }
  return (neg?'-':'')+str;
}
function buildDepositSummary(){
  const rows=(reconciliationResults.length?reconciliationResults:importedLedger).filter(r=>!r.parseWarning);
  const map=new Map();
  for(const r of rows){
    const chain=chainBucketForAsset(r.asset);
    const key=chain+'|'+String(r.asset||'').toUpperCase();
    if(!map.has(key)) map.set(key,{chain,asset:String(r.asset||'').toUpperCase(),count:0,amounts:[],confirmed:0,sourceResolved:0,unknown:0,internalExchange:0,noTxid:0});
    const x=map.get(key);x.count++;x.amounts.push(r.amount||'0');
    if(r.status==='SELF_WALLET_CONFIRMED')x.confirmed++;
    if(r.status==='ONCHAIN_SOURCE_RESOLVED')x.sourceResolved++;
    if(r.status==='SOURCE_UNKNOWN')x.unknown++;
    if(r.sourceRoute==='CRYPTOPANDA_EXCHANGE_RECORDED')x.internalExchange++;
    if(!r.txid)x.noTxid++;
  }
  return [...map.values()].map(x=>({...x,total:addDecimalStrings(x.amounts)}))
    .sort((a,b)=>a.chain.localeCompare(b.chain)||a.asset.localeCompare(b.asset));
}
function renderDepositSummary(){
  const body=$('depositSummaryRows'),meta=$('depositSummaryMeta');
  if(!body||!meta)return;
  body.innerHTML='';
  const summary=buildDepositSummary();
  for(const x of summary){
    const tr=document.createElement('tr');
    tr.innerHTML='<td>'+esc(x.chain)+'</td><td>'+esc(x.asset)+'</td><td>'+x.count+'</td><td><code>'+esc(x.total)+'</code></td><td>'+x.confirmed+'</td><td>'+x.sourceResolved+'</td><td>'+x.unknown+'</td><td>'+x.internalExchange+'</td><td>'+x.noTxid+'</td>';
    body.appendChild(tr);
  }
  const totalRecords=(reconciliationResults.length?reconciliationResults:importedLedger).length;
  const excluded=totalRecords-summary.reduce((n,x)=>n+x.count,0);
  const confirmed=summary.reduce((n,x)=>n+x.confirmed,0);
  const resolved=summary.reduce((n,x)=>n+x.sourceResolved,0);
  const unknown=summary.reduce((n,x)=>n+x.unknown,0);
  meta.textContent=totalRecords?('Total records '+totalRecords+' · Self-wallet confirmed '+confirmed+' · On-chain source resolved '+resolved+' · Source unknown '+unknown+(excluded?' · Incomplete PDF rows excluded from totals '+excluded:'') ):'No deposit records loaded.';
}
function renderReconciliation(){
  const rows=$('reconRows'); if(!rows)return;rows.innerHTML='';
  for(const r of reconciliationResults){const tr=document.createElement('tr');tr.innerHTML=
    '<td>'+esc(r.recordId)+'</td><td>'+esc(r.timestamp?new Date(r.timestamp*1000).toLocaleString('ja-JP'):r.dateRaw||'—')+'</td><td>'+esc(r.asset)+'</td><td>'+esc(r.amount)+'</td><td><span class="pill">'+esc(r.status)+'</span></td><td>'+esc(r.reason)+(r.matchedEvidenceId?'<br><code>'+esc(r.matchedEvidenceId)+'</code>':'')+(r.onchainSourceAddress?'<br>From: <code>'+esc(r.onchainSourceAddress)+'</code>':'')+(r.onchainNetwork?'<br>Network: '+esc(r.onchainNetwork):'')+(r.onchainTxSender&&r.onchainTxSender!==r.onchainSourceAddress?'<br>Tx sender: <code>'+esc(r.onchainTxSender)+'</code>':'')+(r.onchainTokenContract?'<br>Token contract: <code>'+esc(r.onchainTokenContract)+'</code>':'')+(r.onchainResolvedAmount?'<br>On-chain amount: '+esc(r.onchainResolvedAmount):'')+(r.sourceResolutionMethod?'<br>Method: '+esc(r.sourceResolutionMethod):'')+(r.baseResolutionError?'<br>Base resolve error: '+esc(r.baseResolutionError):'')+(r.sourceResolutionError?'<br>Resolve error: '+esc(r.sourceResolutionError):'')+'</td>';rows.appendChild(tr);}
  const counts={};for(const r of reconciliationResults)counts[r.status]=(counts[r.status]||0)+1;
  $('reconSummary').textContent=reconciliationResults.length+' record(s): '+Object.entries(counts).map(([k,v])=>k+' '+v).join(' / ');
  $('reconDetails').innerHTML=reconciliationResults.length?'<h2>Reconciliation methodology</h2><p class="muted">SELF_WALLET_CONFIRMED = TxID exact match, or unique asset/amount/time match against evidence scanned in this browser session. SOURCE_UNKNOWN = no self-wallet match found; exchange/direct-service origin remains an investigative hypothesis until supported by exchange withdrawal records or other primary evidence.</p>':'';
  renderDepositSummary();
}

function render(){const rows=$('rows');rows.innerHTML='';for(const r of matches){const tr=document.createElement('tr');tr.innerHTML=`<td>${esc(r.timestamp?new Date(r.timestamp*1000).toLocaleString('ja-JP'):'—')}</td><td>${esc(r.network)}</td><td>${esc(r.asset)}</td><td>${esc(r.amount)}</td><td><code>${esc(r.to)}</code></td><td><code>${esc(r.txid)}</code></td><td>${esc(r.classification)}</td><td>${esc((r.evidenceRefs||[]).join(', '))}</td>`;rows.appendChild(tr);}$('summary').textContent=matches.length+' matched transfer(s).';renderReportMeta();renderEvidenceDetails();}
function init(){ restoreTraceCache(); $('network').innerHTML=EVM_CHAINS.map(c=>`<option value="${c.chainId}">${c.name}</option>`).join('');
 const update=()=>{const k=$('kind').value;$('networkWrap').style.display='block';$('network').disabled=k!=='evm';$('networkWrap').style.opacity=k==='evm'?'1':'0.55';$('keyWrap').style.display=k==='evm'?'block':'none';$('rpcWrap').style.display=(k==='sol'||k==='xrp')?'block':'none';};$('kind').addEventListener('change',update);update();
 $('scan').onclick=async()=>{const address=$('addr').value.trim();if(!address)return alert('Public addressを入力してください。');$('status').textContent='Scanning…';try{const req={address,apiKey:$('key').value.trim(),rpcUrl:$('rpc').value.trim()||undefined,network:$('network').value,maxRecords:Number($('max').value)||200};let rec=[];if($('kind').value==='btc')rec=await scanBitcoin(req);if($('kind').value==='evm')rec=await scanEvm(req);if($('kind').value==='sol')rec=await scanSolana(req);if($('kind').value==='xrp')rec=await scanXrp(req);scanRetrievedAt=new Date().toISOString();rememberScannedWallet($('kind').value,address,$('kind').value==='evm'?(EVM_CHAINS.find(x=>x.chainId===req.network)?.name||'EVM'):$('kind').value);matches=matchTransfers(rec);matches=await enrichEvidenceRecords(matches);addToSessionPool(matches);saveTraceCache();const c=EVM_CHAINS.find(x=>x.chainId===req.network);lastMeta={scannedAddress:address,sourceRecordCount:rec.length,caseProfileVersion:knownProfile.version,caseProfileSha256:await sha256(JSON.stringify(knownProfile)),retrievedAt:scanRetrievedAt,networkName:($('kind').value==='evm'&&c)?c.name:($('kind').value==='btc'?'Bitcoin':$('kind').value==='sol'?'Solana':'XRP Ledger')};render();$('status').textContent='Completed. '+rec.length+' outgoing candidate(s) inspected; '+matches.length+' matched.';}catch(e){$('status').textContent='Error: '+e.message;}};
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
     renderDepositSummary();
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
 if($('resolveBaseSources')) $('resolveBaseSources').onclick=async()=>{
   if(!reconciliationResults.length)return alert('先にReconcile imported recordsを実行してください。');
   $('resolveBaseSources').disabled=true;
   try{
     const r=await resolveUnknownBaseSources();
     $('baseResolveStatus').textContent='Base source resolution: '+r.resolved+' resolved / '+r.self+' matched confirmed wallet / '+r.notBase+' not on Base / '+r.failed+' failed / '+r.checked+' checked.';
   }catch(e){
     $('baseResolveStatus').textContent='Base source resolution error: '+e.message;
   }finally{$('resolveBaseSources').disabled=false;}
 };
 if($('resolveSolSources')) $('resolveSolSources').onclick=async()=>{
   if(!reconciliationResults.length)return alert('先にReconcile imported recordsを実行してください。');
   $('resolveSolSources').disabled=true;
   try{
     const r=await resolveUnknownSolanaSources();
     $('sourceResolveStatus').textContent='SOL source resolution: '+r.resolved+' resolved / '+r.self+' matched scanned wallet / '+r.failed+' failed / '+r.attempted+' attempted.';
   }catch(e){
     $('sourceResolveStatus').textContent='SOL source resolution error: '+e.message;
   }finally{$('resolveSolSources').disabled=false;}
 };
 if($('exportRecon')) $('exportRecon').onclick=()=>{
   download('EvidenceTracer-Reconciliation-'+exportChainLabel()+'.json',JSON.stringify({
     generatedAt:new Date().toISOString(),
     sessionEvidenceCount:sessionEvidencePool.length,
     scannedWallets:sessionScannedWallets,
     source:importedSourceMeta,
     methodology:{confirmed:'TxID exact or unique asset/amount/time match against self-wallet evidence in this browser session',sourceResolved:'SOL TxID resolved through public/custom JSON-RPC, or Base TxID resolved through the official Base Mainnet RPC using native transaction fields / ERC-20 Transfer logs; source address identification does not establish legal ownership or exchange attribution',unknown:'No self-wallet match found; exchange/direct-service origin not proven'},
     records:reconciliationResults
   },null,2),'application/json');
 };


 if($('saveTraceCache')) $('saveTraceCache').onclick=()=>{saveTraceCache();$('traceCacheStatus').textContent+=' Saved now.';};
 if($('loadTraceCache')) $('loadTraceCache').onclick=()=>{const c=restoreTraceCache();$('traceCacheStatus').textContent='Restored '+c.wallets.length+' wallet(s) / '+c.evidence.length+' evidence record(s) from this browser.';};
 if($('clearTraceCache')) $('clearTraceCache').onclick=()=>{clearTraceCache();$('traceCacheStatus').textContent='Saved trace cache cleared from this browser.';};
 if($('exportTraceCache')) $('exportTraceCache').onclick=()=>exportTraceCache();
 const traceCacheFile=$('traceCacheFile');
 if(traceCacheFile) traceCacheFile.addEventListener('change',async()=>{
   try{
     const file=traceCacheFile.files&&traceCacheFile.files[0];
     if(!file)return;
     const r=await importTraceCacheFile(file);
     $('traceCacheStatus').textContent='Imported '+r.wallets+' wallet(s) / '+r.evidence+' evidence record(s).';
   }catch(e){$('traceCacheStatus').textContent='Trace cache import error: '+e.message;}
 });
 $('clear').onclick=()=>{matches=[];lastMeta={};scanRetrievedAt=null;sessionEvidencePool=[];sessionScannedWallets=[];importedLedger=[];reconciliationResults=[];importedSourceMeta=null;$('addr').value='';$('key').value='';$('rpc').value='';render();renderDepositSummary();renderTraceCacheStatus();$('status').textContent='Cleared from page memory. Saved trace cache remains available.';};
}
window.addEventListener('DOMContentLoaded',()=>{try{init();document.body.dataset.appReady='true';}catch(e){document.getElementById('boot-error').textContent='Application error: '+e.message;document.getElementById('boot-error').style.display='block';}});
