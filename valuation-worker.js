'use strict';
/* CSV ingestion worker. No network or persistent storage. */
const CHUNK_BYTES=512*1024,MAX_ROWS=1000000,MAX_FIELD_BYTES=2*1024*1024;
const validDecimal=s=>/^(?:0|[0-9]+)(?:\.[0-9]+)?$/.test(String(s||'').trim())&&String(s).length<=96;
const utcDay=dt=>{const m=String(dt).match(/^(\d{4})[\/-](\d{2})[\/-](\d{2})\s+(\d{2}):(\d{2})/);if(!m)return '';const d=new Date(m[1]+'-'+m[2]+'-'+m[3]+'T'+m[4]+':'+m[5]+':00+09:00');return Number.isFinite(d.getTime())?d.toISOString().slice(0,10):'';};
const normalizeAsset=s=>String(s||'').trim().toUpperCase().replace(/\s*\(ERC20\)/i,'');
async function parseFile(file,emit){
 const decoder=new TextDecoder('utf-8',{fatal:true});let fields=[],cell='',quoted=false,quotePending=false,pendingCR=false,first=true,items=[],total=0;
 function finishRecord(){fields.push(cell);cell='';if(fields.some(v=>v!=='')){items.push(fields);total++;}fields=[];}
 function pushCell(x){cell+=x;if(cell.length>MAX_FIELD_BYTES)throw Error('CSV field exceeds 2MB');}
 async function flush(){if(!items.length)return;const copy=items;items=[];await emit(copy);await new Promise(resolve=>setTimeout(resolve,0));}
 for(let offset=0;offset<file.size;offset+=CHUNK_BYTES){
  let text=decoder.decode(await file.slice(offset,offset+CHUNK_BYTES).arrayBuffer(),{stream:true});
  if(first){text=text.replace(/^\uFEFF/,'');first=false;}
  for(let i=0;i<text.length;i++){
   const c=text[i];if(pendingCR){pendingCR=false;if(c==='\n')continue;}
   if(quoted){
    if(quotePending){if(c==='"'){pushCell('"');quotePending=false;continue;}quoted=false;quotePending=false;}
    else if(c==='"'){quotePending=true;continue;}else{pushCell(c);continue;}
   }
   if(c==='"'&&cell==='')quoted=true;
   else if(c===','){fields.push(cell);cell='';}
   else if(c==='\n')finishRecord();
   else if(c==='\r'){finishRecord();pendingCR=true;}
   else pushCell(c);
   if(items.length>=2000)await flush();
  }
  if(items.length)await flush();
  self.postMessage({type:'progress',percent:Math.min(100,Math.round((offset+CHUNK_BYTES)/Math.max(1,file.size)*100))});
 }
 const tail=decoder.decode();if(tail)pushCell(tail);
 if(quoted&&!quotePending)throw Error('Unclosed CSV quote');
 if(fields.length||cell!=='')finishRecord();
 await flush();
}
self.onmessage=async event=>{
 const {type,file,id}=event.data||{};if(type!=='import')return;
 let header=null,total=0,invalid=0,accepted=0;
 try{
  await parseFile(file,async batch=>{
   const output=[];
   for(const record of batch){
    if(header===null){
      header=record.map(s=>s.trim().toLowerCase());
      if(!header.includes('asset')||(id==='rows'&&!header.includes('amount'))||(id==='prices'&&!header.some(k=>['price_jpy','jpy','close'].includes(k)))||(id==='audit'&&!['amount','price_jpy','estimated_value_jpy','include_in_valuation'].every(k=>header.includes(k))))throw Error('Missing required CSV headers');
      continue;
    }
    if(++total>MAX_ROWS)throw Error('Limit 1,000,000 CSV records');
    const val=key=>String(record[header.indexOf(key)]||'').trim();
    const r=Object.create(null);
    for(let i=0;i<header.length;i++)if(header[i])r[header[i]]=String(record[i]||'').trim();
    const a=normalizeAsset(r.asset);
    if(id==='audit'){output.push(r);
    }else if(id==='rows'){
      const date=r.datetime_jst||r.date_jst||r.date||'',amount=String(r.amount||'').replace(/,/g,'');
      if(!utcDay(date)||!a||!validDecimal(amount)){invalid++;continue;}
      output.push({id:r.id||'ROW-'+String(total).padStart(6,'0'),datetime_jst:date,asset:a,amount,original_amount:amount,
        txid:r.txid||'',address:r.address||'',category:r.category||'unclassified',notes:r.notes||'',source:r.source||'CSV',
        included:r.included?(/^(1|true|yes)$/i.test(r.included)):(r.category==='onchain_reported'||!r.category),
        manualPrice:validDecimal(r.price_jpy)&&BigInt(String(r.price_jpy).split('.')[0]||'0')>=0n?r.price_jpy:null,manualSource:r.price_source||'',manualSourceUrl:r.price_source_url||'',manualSourceSha256:r.price_source_sha256||'',manualEvidenceRef:r.price_evidence_ref||'',manualPriceMethod:r.price_method||''});
    }else{
      const day=r.date_utc||r.day_utc||r.date||'',px=r.price_jpy||r.jpy||r.close||'';
      if(!a||!/^\d{4}-\d\d-\d\d$/.test(day)||!validDecimal(px)||!/[1-9]/.test(px)){invalid++;continue;}
      output.push({key:a+'|'+day,price:px,source:r.source||'輸入価格CSV',sourceUrl:r.source_url||r.price_source_url||'',sourceSha256:r.source_sha256||r.price_source_sha256||'',evidenceRef:r.evidence_ref||r.price_evidence_ref||'',method:r.method||r.price_method||'UTC_DAILY_CLOSE',checkedAt:r.checked_at_utc||''});
    }
    accepted++;
   }
   if(output.length)self.postMessage({type:'batch',id,rows:output});
  });
  self.postMessage({type:'done',id,total,accepted,invalid});
 }catch(err){self.postMessage({type:'error',id,message:String(err?.message||err)});}
};