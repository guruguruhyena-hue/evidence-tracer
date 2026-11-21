const API='https://blockstream.info/api';
export async function scanBitcoin(req){
  const max=req.maxRecords??200;let url=`${API}/address/${encodeURIComponent(req.address)}/txs`;const all=[];
  while(url&&all.length<max){const res=await fetch(url,{cache:'no-store',referrerPolicy:'no-referrer'});if(!res.ok)throw new Error(`Bitcoin API error ${res.status}`);const page=await res.json();all.push(...page);if(page.length<25)break;const last=page.at(-1)?.txid;if(!last)break;url=`${API}/address/${encodeURIComponent(req.address)}/txs/chain/${last}`;}
  const out=[];for(const tx of all.slice(0,max)){const inputOwned=(tx.vin||[]).some(v=>v.prevout?.scriptpubkey_address===req.address);if(!inputOwned)continue;for(const vout of tx.vout||[]){const to=vout.scriptpubkey_address;if(!to||to===req.address)continue;out.push({chain:'btc',network:'Bitcoin',txid:tx.txid,timestamp:tx.status?.block_time??null,block:tx.status?.block_height??null,from:req.address,to,asset:'BTC',amount:satsToBtc(vout.value??0),status:tx.status?.confirmed?'confirmed':'pending',source:'Blockstream Esplora',raw:tx});}}return out;
}
function satsToBtc(v){const s=String(v).padStart(9,'0');return `${s.slice(0,-8)}.${s.slice(-8)}`.replace(/\.0+$/,'').replace(/(\.\d*?)0+$/,'$1');}
