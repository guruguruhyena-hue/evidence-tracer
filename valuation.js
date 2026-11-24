'use strict';
const MAX_CSV_BYTES=500*1024*1024,CHUNK_BYTES=512*1024,MAX_SYMBOLS=100,MAX_RECORDS=1000000;const PAGE_SIZE=100;let rows=[],quotes=new Map(),status='',currentPage=0,loadBusy=false;let sourceFileSHA='',priceFileSHA='',sourceFileName='',priceFileName='';const $=id=>document.getElementById(id);const nfmt=(v,max=8)=>new Intl.NumberFormat('ja-JP',{maximumFractionDigits:max}).format(v);const currency=(v)=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(v);
// One worker per import. Parsed batches remain in browser memory only.
async function readLargeCsv(file,mode){
 if(loadBusy)return setStatus('別のCSVを読み込み中です');
 if(file.size>MAX_CSV_BYTES)return setStatus('CSVは500MB以下にしてください：'+file.name);
 if(typeof Worker==='undefined')return setStatus('Web Worker非対応ブラウザです。最新版Chrome/Firefoxで開いてください。');
 loadBusy=true;const inputs=[$('fileCsv'),$('filePrice'),$('fetchPrices'),$('export'),$('auditAndExport')];inputs.forEach(i=>i.disabled=true);
 setStatus('CSV読込を開始：'+file.name+' ('+Math.round(file.size/1024)+' KB)／Web Worker起動中');
 const stagedRows=[],stagedPrices=new Map();
 try{
  const worker=new Worker(new URL('./valuation-worker.js?v=20261124-review2024',document.baseURI),{type:'classic'});
  await new Promise(resolve=>{
   let ended=false;
   const finish=(message,successful)=>{
     if(ended)return;ended=true;
     clearTimeout(timer);
     worker.terminate();
     if(successful){
      if(mode==='rows'){
       rows=stagedRows;currentPage=0;updateFilters();
       sourceFileName=file.name;sourceFileSHA='';
       $('inputFileHash').textContent='SHA-256計算中…';
       hashFileForEvidence(file).then(hash=>{sourceFileSHA=hash;$('inputFileHash').textContent=hash;});
      }else{
       for(const [k,v] of stagedPrices)quotes.set(k,v);
       priceFileName=file.name;priceFileSHA='';
       $('priceFileHash').textContent='SHA-256計算中…';
       hashFileForEvidence(file).then(hash=>{priceFileSHA=hash;$('priceFileHash').textContent=hash;});
      }
      render();
      if(mode==='rows'){
       const reviewed=stagedRows.filter(r=>r.category==='review').length;
       if(reviewed)message+=' 要確認（review）'+reviewed+'件は参考評価の候補として含めました。送金・着金を裏付ける証拠確認は別途必要です。';
      }
     }
     setStatus(message);
     resolve();
   };
   // Avoid indefinite silent hangs if Pages has not published the worker bundle.
   const timer=setTimeout(()=>finish('CSV解析タイムアウト：Workerの配信とブラウザの開発者コンソールを確認してください。',false),90000);
   worker.onmessage=event=>{
    const msg=event.data||{};
    if(msg.type==='progress'){setStatus('CSV解析中 '+file.name+'：'+msg.percent+'%');return;}
    if(msg.type==='batch'){
     if(mode==='rows')stagedRows.push(...msg.rows);
     else for(const item of msg.rows)stagedPrices.set(item.key,{price:item.price,source:item.source,sourceUrl:item.sourceUrl||'',sourceSha256:item.sourceSha256||'',evidenceRef:item.evidenceRef||'',method:item.method||'',timestamp:item.checkedAt||new Date().toISOString()});
     return;
    }
    if(msg.type==='done'){
      finish('CSV読込完了：'+(mode==='rows'?stagedRows.length:stagedPrices.size)+'件。無効な行：'+msg.invalid+'件。',true);
    }else if(msg.type==='error'){
      finish('CSV解析失敗（'+file.name+'）：'+msg.message+'。必要な列や文字コードを確認してください。',false);
    }
   };
   worker.onerror=e=>finish('CSV Workerの実行に失敗：'+(e.message||'配信ファイルが404またはブロックされた可能性')+'。ブラウザ再読込とGitHub Pagesの公開状態を確認してください。',false);
   worker.postMessage({type:'import',file,id:mode==='rows'?'rows':'prices'});
  });
 }catch(e){
   setStatus('CSV Workerを起動できません：'+String(e?.message||e)+'。GitHub Pagesの最新版を確認してください。');
 }finally{
   loadBusy=false;inputs.forEach(i=>i.disabled=false);
 }
}
async function hashFileForEvidence(file){
 if(file.size>32*1024*1024)return 'UNAVAILABLE_LARGE_FILE_OVER_32_MIB';
 try{const buffer=await file.arrayBuffer();const digest=await crypto.subtle.digest('SHA-256',buffer);return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');}
 catch{return 'SHA256_UNAVAILABLE';}
}
function csvCell(v){let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'}
function makeCSV(arr,fields){return '\ufeff'+fields.join(',')+'\r\n'+arr.map(r=>fields.map(k=>csvCell(r[k])).join(',')).join('\r\n')+'\r\n'}
async function exportLargeCSV(name,data,fields,transform=(row)=>row){
 const chunks=['\ufeff'+fields.join(',')+'\r\n'];let lines=[];
 for(let i=0;i<data.length;i++){
  const obj=transform(data[i]);lines.push(fields.map(k=>csvCell(obj[k])).join(',')+'\r\n');
  if(lines.length>=2000){chunks.push(lines.join(''));lines=[];if(i%10000<2000)await new Promise(resolve=>setTimeout(resolve,0));}
 }
 if(lines.length)chunks.push(lines.join(''));
 const blob=new Blob(chunks,{type:'text/csv;charset=utf-8'}),link=document.createElement('a');
 link.href=URL.createObjectURL(blob);link.download=name;document.body.append(link);link.click();
 setTimeout(()=>{URL.revokeObjectURL(link.href);link.remove()},60000);
 setStatus('評価CSVを出力しました：'+data.length+'行。');
}

function dl(name,body){const blob=new Blob([body],{type:'text/csv;charset=utf-8'}),link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=name;document.body.append(link);link.click();setTimeout(()=>{URL.revokeObjectURL(link.href);link.remove()},400)}
function UTCday(datetime){const m=String(datetime).match(/^(\d{4})[\/-](\d\d)[\/-](\d\d)\s+(\d\d):(\d\d)/);if(!m)return '';let d=new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+09:00`);return Number.isFinite(d.getTime())?d.toISOString().slice(0,10):''}
const normalizeAsset=a=>String(a||'').toUpperCase().trim().replace(/\s*\(ERC20\)/i,'');
// Decimal arithmetic: currency values are integer JPY cents. No floating-point multiplication.
function decimalParts(raw){
 const value=String(raw??'').trim();
 if(!/^(?:0|[0-9]+)(?:\.[0-9]+)?$/.test(value)||value.length>96)throw Error('無効な小数値');
 const [whole,fraction='']=value.split('.');
 return {value:BigInt(whole+fraction),scale:fraction.length};
}
function centsOf(amount,price){
 const a=decimalParts(amount),p=decimalParts(price);
 const numerator=a.value*p.value*100n,denominator=10n**BigInt(a.scale+p.scale);
 return (numerator+denominator/2n)/denominator; // positive values, half-up to 0.01 JPY
}
function centsString(v){const abs=v<0n?-v:v;return(v<0n?'-':'')+(abs/100n).toString()+'.'+(abs%100n).toString().padStart(2,'0')}
function jpyCents(v){const abs=v<0n?-v:v;return(v<0n?'-':'')+(abs/100n).toLocaleString('ja-JP')+'.'+(abs%100n).toString().padStart(2,'0')+'円'}
function positiveDecimal(v){try{return decimalParts(v).value>0n}catch{return false}}
const priceKey=(a,d)=>`${normalizeAsset(a)}|${d}`;
function selectedDefault(r){return r.category==='onchain_reported' || !r.category}
const getPrice=r=>{if(positiveDecimal(r.manualPrice))return {price:r.manualPrice,source:r.manualSource||'手動入力',sourceUrl:r.manualSourceUrl||'',sourceSha256:r.manualSourceSha256||'',evidenceRef:r.manualEvidenceRef||'',method:r.manualPriceMethod||'DOCUMENTED_MANUAL_QUOTE',date:UTCday(r.datetime_jst)};const d=UTCday(r.datetime_jst),v=quotes.get(priceKey(r.asset,d));return v?{...v,date:d}:null};
function setStatus(msg){$('progress').textContent=msg}
function updateFilters(){const c=$('coinFilter'),old=c.value;c.textContent='';let opt=document.createElement('option');opt.value='';opt.textContent='すべて';c.append(opt);[...new Set(rows.map(r=>r.asset))].sort().forEach(a=>{let o=document.createElement('option');o.value=o.textContent=a;c.append(o)});c.value=old}
// Exact quantity totals: align decimal scales without converting amounts into JS Number.
function addDecimalToAccumulator(acc, raw){
 const d=decimalParts(raw);
 if(d.scale>acc.scale){acc.value*=10n**BigInt(d.scale-acc.scale);acc.scale=d.scale;}
 acc.value+=d.value*10n**BigInt(acc.scale-d.scale);
}
function decimalAccumulatorString(acc){
 const digits=acc.value.toString();
 if(!acc.scale)return digits;
 const padded=digits.padStart(acc.scale+1,'0');
 return (padded.slice(0,-acc.scale)+'.'+padded.slice(-acc.scale)).replace(/\.?0+$/,'')||'0';
}
function newAssetAggregate(asset){return {asset,all:0,included:0,priced:0,unpriced:0,excluded:0,quantity:{value:0n,scale:0},pricedQuantity:{value:0n,scale:0},cents:0n}}
let summaryGeneration=0,latestAssetSummary=[];
function renderAssetSummary(summaries,included,priced,total,excluded){
 latestAssetSummary=summaries;
 $('summaryTotalYen').textContent=priced?jpyCents(total):'未計算';
 $('summaryAssets').textContent=summaries.length+'銘柄';
 $('summaryAssetNames').textContent=summaries.map(x=>x.asset).join(' / ')||'CSV未読込';
 $('summaryCoverage').textContent=included?Math.round(priced/included*1000)/10+'%':'—';
 $('summaryPending').textContent=(included-priced)+'件 / '+excluded+'件';
 const body=$('assetSummaryRows');body.textContent='';
 if(!summaries.length){
  const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=8;td.textContent='CSVを読み込むと集計を表示します。';tr.append(td);body.append(tr);return;
 }
 const frag=document.createDocumentFragment();
 for(const a of summaries){
  const tr=document.createElement('tr');
  for(const val of [a.asset,a.all,a.included,decimalAccumulatorString(a.quantity),decimalAccumulatorString(a.pricedQuantity),a.unpriced,a.excluded,a.priced?jpyCents(a.cents):'未計算']){
   const td=document.createElement('td');td.textContent=String(val);tr.append(td);
  }
  frag.append(tr);
 }
 body.append(frag);
}
function scheduleSummary(){
 const generation=++summaryGeneration;
 let pos=0,included=0,priced=0,excluded=0,total=0n;const byAsset=new Map();
 $('totalRows').textContent=nfmt(rows.length);
 $('totalYen').textContent='集計中…';
 $('summaryTotalYen').textContent='集計中…';
 function step(){
  if(generation!==summaryGeneration)return;
  const stop=Math.min(pos+4000,rows.length);
  for(;pos<stop;pos++){
   const r=rows[pos];const asset=r.asset||'未設定';
   if(!byAsset.has(asset))byAsset.set(asset,newAssetAggregate(asset));
   const a=byAsset.get(asset);a.all++;
   if(!r.included||!positiveDecimal(r.original_amount)){a.excluded++;excluded++;continue;}
   a.included++;included++;addDecimalToAccumulator(a.quantity,r.original_amount);
   const p=getPrice(r);
   if(p){
    const cents=centsOf(r.original_amount,p.price);
    a.priced++;priced++;a.cents+=cents;total+=cents;
    addDecimalToAccumulator(a.pricedQuantity,r.original_amount);
   }else{a.unpriced++;}
  }
  if(pos<rows.length){setTimeout(step,0);return;}
  $('includedRows').textContent=nfmt(included);
  $('pricedRows').textContent=priced+' / '+included;
  $('totalYen').textContent=priced?jpyCents(total):'未計算';
  $('totalContext').textContent=priced===included&&priced?'選択対象の全件に単価あり（各行0.01円単位で四捨五入）':'価格のない評価対象は含まない部分計（損害額ではない）';
  renderAssetSummary([...byAsset.values()].sort((a,b)=>a.asset.localeCompare(b.asset)),included,priced,total,excluded);
 }
 step();
}
$('exportSummary').addEventListener('click',()=>{
 if(!latestAssetSummary.length)return setStatus('集計対象がありません。先にCSVを読み込んでください。');
 const records=latestAssetSummary.map(a=>({asset:a.asset,total_rows:a.all,valuation_rows:a.included,
  included_quantity:decimalAccumulatorString(a.quantity),priced_quantity:decimalAccumulatorString(a.pricedQuantity),
  priced_rows:a.priced,unpriced_rows:a.unpriced,excluded_rows:a.excluded,
  estimated_jpy_priced_only:centsString(a.cents),
  note:'Only included rows with known historical prices; not legal damages'}));
 dl('asset_valuation_summary.csv',makeCSV(records,Object.keys(records[0])));
});
function render(){scheduleSummary();
const term=$('filter').value.toLowerCase(),asset=$('coinFilter').value,st=$('stateFilter').value;let view=rows.filter(r=>(!asset||r.asset===asset)&&(!term||[r.id,r.asset,r.datetime_jst,r.txid,r.notes,r.address].join(' ').toLowerCase().includes(term))&&(!st||(st==='priced'&&!!getPrice(r))||(st==='unpriced'&&!getPrice(r))||(st==='included'&&r.included)||(st==='excluded'&&!r.included)));
const pageCount=Math.max(1,Math.ceil(view.length/PAGE_SIZE));currentPage=Math.min(currentPage,pageCount-1);const start=currentPage*PAGE_SIZE;const visible=view.slice(start,start+PAGE_SIZE);const tbody=$('tbody');tbody.textContent='';const fragment=document.createDocumentFragment();visible.forEach(r=>{const tr=document.createElement('tr');if(!r.included)tr.className='dim';function td(s,className){const x=document.createElement('td');x.textContent=s;if(className)x.className=className;tr.append(x);return x}
const t=document.createElement('td');let chk=document.createElement('input');chk.type='checkbox';chk.checked=r.included;chk.className='inlinecheck';chk.title='この行を評価対象に含める';chk.addEventListener('change',()=>{r.included=chk.checked;render()});t.append(chk);tr.append(t);td(r.datetime_jst);td(r.asset);td(r.original_amount,'amount');const ti=document.createElement('td'),pi=document.createElement('input');pi.className='editprice';pi.type='number';pi.step='any';pi.min='0';pi.placeholder=getPrice(r)?String(getPrice(r).price):'未取得';pi.value=positiveDecimal(r.manualPrice)?String(r.manualPrice):'';pi.title=getPrice(r)?.source||'価格未取得';pi.addEventListener('change',()=>{r.manualPrice=positiveDecimal(pi.value)?pi.value:null;render()});ti.append(pi);
const evidenceButton=document.createElement('button');evidenceButton.type='button';evidenceButton.className='btn hideprint';evidenceButton.style.cssText='font-size:10px;padding:3px 6px;margin-top:3px';evidenceButton.textContent='根拠を記録';
evidenceButton.addEventListener('click',()=>{
 const label=prompt('価格資料の発行者・名称',r.manualSource||'');if(label===null)return;
 const ref=prompt('証拠URL・保存資料のID（原資料PDFなら証拠ID）',r.manualSourceUrl||r.manualEvidenceRef||'');if(ref===null)return;
 r.manualSource=label.trim();r.manualPriceMethod='DOCUMENTED_MANUAL_QUOTE';
 if(/^https?:\/\//i.test(ref)){r.manualSourceUrl=ref.trim();r.manualEvidenceRef='';}else{r.manualEvidenceRef=ref.trim();r.manualSourceUrl='';}
 render();
});ti.append(evidenceButton);if(getPrice(r)){const div=document.createElement('div');div.className='hint';div.textContent=(positiveDecimal(r.manualPrice)?'手動':'API/価格表')+' · '+UTCday(r.datetime_jst);ti.append(div)}tr.append(ti);const p=getPrice(r);td(p?jpyCents(centsOf(r.original_amount,p.price)):'—',p?'value':'muted');const catText={onchain_reported:'TxID記載',review:'要確認',service_credit:'サービス内入金',zero:'数量0',unclassified:'未分類'};let state=td(catText[r.category]||r.category);state.title=r.notes;let meta=td((r.txid&&r.txid!=='-'?r.txid.slice(0,14)+'…':'TxID記載なし')+(r.notes?' · '+r.notes:''));meta.title=[r.txid,r.address,r.notes].filter(Boolean).join('\n');fragment.append(tr)});tbody.append(fragment);$('shown').textContent=`表示 ${view.length?start+1:0}〜${Math.min(view.length,start+PAGE_SIZE)} / 条件一致${view.length}件（全${rows.length}件）。ページ ${currentPage+1}/${pageCount}`;$('prevPage').disabled=currentPage===0;$('nextPage').disabled=currentPage>=pageCount-1}
$('fileCsv').addEventListener('change',async e=>{const f=e.target.files[0];if(f)await readLargeCsv(f,'rows');e.target.value=''});
$('filePrice').addEventListener('change',async e=>{const f=e.target.files[0];if(f)await readLargeCsv(f,'price');e.target.value=''});
$('prevPage').addEventListener('click',()=>{if(currentPage>0){currentPage--;render()}});
$('nextPage').addEventListener('click',()=>{currentPage++;render()});
['filter','coinFilter','stateFilter'].forEach(x=>$(x).addEventListener('input',render));
$('fetchPrices').addEventListener('click',async()=>{
 if(loadBusy)return setStatus('CSV読込完了後に共有価格DBを照合してください');
 if(!rows.length)return setStatus('先に取引CSVを読み込んでください');
 const engine=globalThis.SharedPriceDatabase;
 if(!engine)return setStatus('共有価格DBのプログラムが未配信です。ブラウザを強制再読み込みしてください');
 const btn=$('fetchPrices'),assets=[...new Set(rows.map(r=>r.asset))];
 const dates=[...new Set(rows.map(r=>UTCday(r.datetime_jst)).filter(Boolean))];
 btn.disabled=true;setStatus('共有価格データベースを照合中（取引CSVは外部に送信しません）…');
 try{
  const {output,errors,manifest}=await engine.obtain({assets,dates,onProgress:setStatus});
  for(const [key,item] of output)quotes.set(key,item);
  render();
  const supported=assets.filter(a=>engine.SUPPORTED.has(a));
  const covered=supported.filter(a=>[...output.keys()].some(k=>k.startsWith(a+'|')));
  setStatus('共有DB：'+output.size+'件の過去レートを照合。対象8銘柄中 '+covered.length+'銘柄に一致。更新：'+(manifest.generated_at_utc||'不明')+
   (errors.length?'／未収録：'+errors.slice(0,20).join(' / '):'')+
   '。JPYはUSDT建て終値×参考USD/JPYで計算した概算値です。');
 }catch(e){
  setStatus('共有価格DBを読み込めません：'+String(e?.message||e)+'。DBの初回生成・Pages配信状況を確認してください。必要なら「直接API取得」で試せます。');
 }finally{btn.disabled=false;}
});
$('fetchLivePrices').addEventListener('click',async()=>{
 if(loadBusy){setStatus('CSVの解析完了後に実行してください');return;}
 if(!rows.length){setStatus('先に取引CSVを読み込んでください。解析完了の件数が表示されます。');return;}
 const engine=globalThis.HistoricalPriceSources;
 if(!engine){setStatus('新価格モジュールの読み込みに失敗しました。ブラウザを強制更新してください。');return;}
 const assets=[...new Set(rows.map(r=>r.asset))].filter(Boolean);
 if(assets.length>MAX_SYMBOLS){setStatus('100種類を超える通貨は価格CSVを使用してください');return;}
 const dates=[...new Set(rows.map(r=>UTCday(r.datetime_jst)).filter(Boolean))];
 const btn=$('fetchPrices');btn.disabled=true;setStatus('BinanceとFrankfurterの過去価格を照会します（参考評価額）。');
 try{
  const {output,errors}=await engine.obtain({assets,dates,onProgress:setStatus});
  for(const [key,value] of output)quotes.set(key,value);
  render();
  const matched=assets.filter(asset=>[...output.keys()].some(key=>key.startsWith(asset+'|')));
  setStatus('歴史価格取得：'+matched.length+'/'+assets.length+'通貨、対象日の価格 '+output.size+'件。' +
    (errors.length?' 未取得／要確認 '+errors.join(' / '):'')+
    '。※ USDT建て日足×USD/JPY参照為替の推計。取引時点の円建て約定価格ではありません。');
 }catch(e){
  const err=String(e?.message||e);
  setStatus('価格取得に失敗：'+err+'。GitHub Pagesから外部APIへ通信できない場合、価格CSVから取り込んでください。');
 }finally{btn.disabled=false;}
});
$('export').addEventListener('click',async()=>{if(!rows.length)return;
 const fields=ValuationAudit.COLS;
 const btn=$('export');btn.disabled=true;
 try{await exportLargeCSV('crypto_deposit_jpy_valuation.csv',rows,fields,r=>{const p=getPrice(r);return {id:r.id,datetime_jst:r.datetime_jst,price_date_utc:UTCday(r.datetime_jst),asset:r.asset,amount:r.original_amount,include_in_valuation:r.included?'yes':'no',price_jpy:p?.price??'',estimated_value_jpy:p?centsString(centsOf(r.original_amount,p.price)):'',price_source:p?.source||'',price_source_url:p?.sourceUrl||'',price_source_sha256:p?.sourceSha256||'',price_evidence_ref:p?.evidenceRef||'',price_method:p?.method||'UTC_DAILY_CLOSE',price_checked_at_utc:p?.timestamp||'',txid:r.txid,address:r.address,category:r.category,notes:r.notes,original_source:r.source}});}finally{btn.disabled=false;}
});
$('exportPrice').addEventListener('click',async()=>{if(!quotes.size)return setStatus('価格データがありません');
 const btn=$('exportPrice');btn.disabled=true;
 try{await exportLargeCSV('historical_price_evidence.csv',[...quotes],['date_utc','asset','price_jpy','source','source_url','source_sha256','evidence_ref','method','checked_at_utc'],([key,v])=>({date_utc:key.split('|')[1],asset:key.split('|')[0],price_jpy:v.price,source:v.source,source_url:v.sourceUrl||'',source_sha256:v.sourceSha256||'',evidence_ref:v.evidenceRef||'',method:v.method||'',checked_at_utc:v.timestamp||''}));}finally{btn.disabled=false;}
});
$('template').addEventListener('click',()=>dl('transaction_template.csv',makeCSV([{datetime_jst:'2024/01/05 12:00',asset:'BTC',amount:'0.01',txid:'',address:'',category:'onchain_reported',notes:'例：これはサンプルです'}],['datetime_jst','asset','amount','txid','address','category','notes'])));
$('clear').addEventListener('click',()=>{if(!confirm('画面上の取引と価格の一時データを消去しますか？'))return;rows=[];quotes.clear();updateFilters();render();setStatus('初期化しました。取引CSVを読み込んでください。')});
render();

$('printPage').addEventListener('click',()=>window.print());
