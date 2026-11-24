'use strict';
const MAX_CSV_BYTES=500*1024*1024,CHUNK_BYTES=512*1024,MAX_SYMBOLS=100,MAX_RECORDS=1000000;const PAGE_SIZE=100;let rows=[],quotes=new Map(),status='',currentPage=0,loadBusy=false;let sourceFileSHA='',priceFileSHA='',sourceFileName='',priceFileName='';const $=id=>document.getElementById(id);const nfmt=(v,max=8)=>new Intl.NumberFormat('ja-JP',{maximumFractionDigits:max}).format(v);const currency=(v)=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(v);
// One worker per import. Parsed batches remain in browser memory only.
async function readLargeCsv(file,mode){
 if(loadBusy)return setStatus('別のCSVを読み込み中です');
 if(file.size>MAX_CSV_BYTES)return setStatus('CSVは500MB以下にしてください：'+file.name);
 if(typeof Worker==='undefined')return setStatus('Web Worker非対応ブラウザです。最新版Chrome/Firefoxで開いてください。');
 loadBusy=true;const inputs=[$('fileCsv'),$('filePrice')];inputs.forEach(i=>i.disabled=true);
 setStatus('CSV読込を開始：'+file.name+' ('+Math.round(file.size/1024)+' KB)／Web Worker起動中');
 const stagedRows=[],stagedPrices=new Map();
 try{
  const worker=new Worker(new URL('./valuation-worker.js?v=20261124-police3',document.baseURI),{type:'classic'});
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
let summaryGeneration=0;
function scheduleSummary(){
 const generation=++summaryGeneration;
 let pos=0,included=0,priced=0,total=0n;
 $('totalRows').textContent=nfmt(rows.length);
 $('totalYen').textContent='集計中…';
 function step(){
  if(generation!==summaryGeneration)return;
  const stop=Math.min(pos+4000,rows.length);
  for(;pos<stop;pos++){
   const r=rows[pos];if(!r.included||!positiveDecimal(r.original_amount))continue;
   included++;const p=getPrice(r);if(p){priced++;total+=centsOf(r.original_amount,p.price);}
  }
  if(pos<rows.length){setTimeout(step,0);return;}
  $('includedRows').textContent=nfmt(included);
  $('pricedRows').textContent=priced+' / '+included;
  $('totalYen').textContent=priced?jpyCents(total):'未計算';
  $('totalContext').textContent=priced===included&&priced?'選択対象の全件に単価あり（各行0.01円単位で四捨五入）':'価格のない評価対象は含まない部分計（損害額ではない）';
 }
 step();
}
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
$('fetchPrices').addEventListener('click',async()=>{if(!rows.length){setStatus('取引CSVをまだ正常に読み込めていません。「取引CSVを読み込む」でCSVを選択し、上の「CSV読込完了：○件」を確認してください。Worker失敗の場合はエラーが表示されます。');return}const symbols=[...new Set(rows.map(r=>r.asset))].filter(a=>!['IZKY','AKC'].includes(a));if(symbols.length>MAX_SYMBOLS){setStatus('価格APIの負荷を抑えるため100通貨まで一括照会できます。手動価格CSVなら制限はありません。');return}let last=0;for(const r of rows){const ms=Date.parse(UTCday(r.datetime_jst)+'T00:00:00Z');if(Number.isFinite(ms)&&ms>last)last=ms;}if(!last){setStatus('有効な日時がありません');return;}let finish=Math.floor(last/1000)+86400,success=0,fail=[];const btn=$('fetchPrices');btn.disabled=true;for(let i=0;i<symbols.length;i++){const a=symbols[i];setStatus(`公開価格APIに照会中 ${i+1}/${symbols.length}：${a}（取得できた行だけ評価）`);try{const url=`https://min-api.cryptocompare.com/data/v2/histoday?fsym=${encodeURIComponent(a)}&tsym=JPY&limit=950&toTs=${finish}&extraParams=EVIDENCE_TRACER_VALUATION`;const res=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!res.ok)throw Error('HTTP '+res.status);const data=await res.json();if(data.Response==='Error')throw Error(data.Message||'API error');const bars=data.Data?.Data;if(!Array.isArray(bars)||!bars.length)throw Error('日足データなし');let ct=0;for(const bar of bars){if(Number(bar.close)>0&&Number.isFinite(bar.time)){const d=new Date(bar.time*1000).toISOString().slice(0,10);quotes.set(priceKey(a,d),{price:String(bar.close),source:'CryptoCompare histoday JPY UTC daily close',sourceUrl:url,sourceSha256:'',evidenceRef:'',method:'UTC_DAILY_CLOSE',timestamp:new Date().toISOString()});ct++}}if(ct)success++;else fail.push(a+':有効価格なし')}catch(e){fail.push(a+':'+String(e.message||e))}render()}btn.disabled=false;setStatus(`価格API：${success}/${symbols.length}通貨に価格データ取得。${fail.length?'要確認 '+fail.join(' / '):'処理完了'}。AKC・IZKYは個別調査・手動単価が必要です。`)});
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
