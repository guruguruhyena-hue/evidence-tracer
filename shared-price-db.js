'use strict';
/* Same-origin shared cache client: no private address, wallet or transaction CSV leaves the browser.
 * All data is static public market-reference data under ./prices/<asset>/<year>.json.
 */
(function(root){
 const SUPPORTED=new Set(['BTC','ETH','SOL','XRP','USDC','USDT','SHIB','OP']);
 const json=async path=>{
  const response=await fetch(path,{cache:'no-cache',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('HTTP '+response.status+' for '+path);
  return response.json();
 };
 async function obtain({assets,dates,assetDates,onProgress}){
  const base='./prices/';
  const manifest=await json(base+'manifest.json');
  if(manifest.schema_version!==1||!manifest.assets)throw Error('DBマニフェスト形式が不正です');
  const wanted=new Map();
  const uniqueDates=new Set(dates.filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)));
  const errors=[],result=new Map();
  for(const asset of assets){
   if(!SUPPORTED.has(asset)){errors.push(asset+':共有DB対象外（独自トークンは手動資料）');continue;}
   const yearMap=new Map();
   const daysForAsset=assetDates?.[asset] ? new Set(assetDates[asset]) : uniqueDates;
   for(const day of daysForAsset){if(!/^\d{4}-\d{2}-\d{2}$/.test(day))continue;const yr=day.slice(0,4);if(!yearMap.has(yr))yearMap.set(yr,new Set());yearMap.get(yr).add(day);}
   wanted.set(asset,yearMap);
  }
  const total=[...wanted.values()].reduce((n,v)=>n+v.size,0);
  let done=0;
  for(const [asset,byYear] of wanted){
   for(const [year,neededDates] of byYear){
    done++;onProgress?.('共通DB照合中：'+done+'/'+total+' '+asset+' '+year);
    if(!manifest.assets[asset]?.years?.includes(year)){errors.push(asset+'/'+year+':未収録');continue;}
    const path=base+asset+'/'+year+'.json';
    try{
     const doc=await json(path);
     if(doc.schema_version!==1||doc.asset!==asset||String(doc.year)!==year||!Array.isArray(doc.rows))throw Error('ファイル内容が不正');
     for(const row of doc.rows){
      const day=row.date_utc;
      if(!neededDates.has(day)||row.asset!==asset||!/^\d+(?:\.\d+)?$/.test(String(row.price_jpy)))continue;
      result.set(asset+'|'+day,{
       price:String(row.price_jpy),
       source:String(row.source||''),
       sourceUrl:String(row.source_url||''),
       sourceSha256:String(row.source_sha256||''),
       evidenceRef:String(row.evidence_ref||'')+' / cached '+path,
       method:String(row.method||''),
       timestamp:String(row.checked_at_utc||manifest.generated_at_utc||'')
      });
     }
    }catch(e){errors.push(asset+'/'+year+':'+String(e.message||e));}
   }
  }
  return {output:result,errors,manifest};
 }
 root.SharedPriceDatabase={obtain,SUPPORTED};
})(globalThis);
