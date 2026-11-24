'use strict';
const MAX_CSV_BYTES=500*1024*1024,CHUNK_BYTES=512*1024,MAX_SYMBOLS=100;const PAGE_SIZE=100;let rows=[],quotes=new Map(),status='',currentPage=0,loadBusy=false;const $=id=>document.getElementById(id);const nfmt=(v,max=8)=>new Intl.NumberFormat('ja-JP',{maximumFractionDigits:max}).format(v);const currency=(v)=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(v);
function csvParse(s){const out=[];let cell='',row=[],quoted=false;for(let i=0;i<s.length;i++){let c=s[i];if(quoted){if(c==='"'&&s[i+1]==='"'){cell+='"';i++}else if(c==='"')quoted=false;else cell+=c}else if(c==='"')quoted=true;else if(c===','){row.push(cell);cell=''}else if(c==='\n'||c==='\r'){if(c==='\r'&&s[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x!==''))out.push(row);row=[];cell=''}else cell+=c}row.push(cell);if(row.some(x=>x!==''))out.push(row);return out}
function readCsv(s){let arr=csvParse(s.replace(/^\ufeff/,''));if(!arr.length)return [];let head=arr.shift().map(x=>x.trim().toLowerCase());return arr.map(v=>Object.fromEntries(head.map((k,i)=>[k,(v[i]||'').trim()]))) }
// Streaming CSV parser: UTF-8 chunks, embedded newlines and escaped double quotes.
async function streamCSV(file,onRows){
 const decoder=new TextDecoder('utf-8'), batch=[];let fields=[],cell='',quoted=false,quotePending=false,pendingCR=false,atStart=true;
 const emit=()=>{fields.push(cell);cell='';if(fields.some(x=>x!==''))batch.push(fields);fields=[];};
 const flush=async()=>{if(!batch.length)return;const copy=batch.splice(0);onRows(copy);await new Promise(resolve=>setTimeout(resolve,0));};
 for(let offset=0;offset<file.size;offset+=CHUNK_BYTES){
  let text=decoder.decode(await file.slice(offset,offset+CHUNK_BYTES).arrayBuffer(),{stream:true});
  if(atStart){text=text.replace(/^\uFEFF/,'');atStart=false;}
  for(let i=0;i<text.length;i++){
   const c=text[i];if(pendingCR){pendingCR=false;if(c==='\n')continue;}
   if(quoted){if(quotePending){if(c==='"'){cell+='"';quotePending=false;continue;}quoted=false;quotePending=false;}else if(c==='"'){quotePending=true;continue;}else{cell+=c;continue;}}
   if(c==='"'&&cell===''){quoted=true;}
   else if(c===','){fields.push(cell);cell='';}
   else if(c==='\r'){emit();pendingCR=true;}
   else if(c==='\n'){emit();}
   else cell+=c;
  }
  if(batch.length)await flush();
  if(offset===0||offset+CHUNK_BYTES>=file.size||Math.floor(offset/(CHUNK_BYTES*12))!==Math.floor((offset+CHUNK_BYTES)/(CHUNK_BYTES*12)))
   setStatus('CSVを分割読込中：'+Math.min(100,Math.round((offset+CHUNK_BYTES)*100/Math.max(1,file.size)))+'%');
 }
 const tail=decoder.decode();if(tail)cell+=tail;
 if(quotePending){quoted=false;quotePending=false;}
 if(quoted)throw Error('CSVの引用符が閉じていません');
 if(fields.length||cell!=='')emit();await flush();
}
async function readLargeCsv(file,mode){
 if(loadBusy)return setStatus('別のCSVを処理中です');if(file.size>MAX_CSV_BYTES)return setStatus('安全のため1ファイル500MBまで対応しています。分割してください。');
 loadBusy=true;const fileButtons=[$('fileCsv'),$('filePrice')];fileButtons.forEach(x=>x.disabled=true);
 let headings=null,count=0,invalid=0,latestRows=[],latestQuotes=new Map();let maxCount=0;
 try{
  await streamCSV(file,(batch)=>{
   for(const record of batch){
    if(headings===null){headings=record.map(x=>x.trim().toLowerCase());continue;}
    const data=Object.fromEntries(headings.map((k,i)=>[k,(record[i]||'').trim()]));
    if(mode==='rows'){
      const date=data.datetime_jst||data.date_jst||data.date||'',amountRaw=data.amount||'',amount=Number(String(amountRaw).replaceAll(',',''));
      if(!UTCday(date)||!data.asset||!Number.isFinite(amount)||amount<0){invalid++;continue;}
      latestRows.push({id:data.id||`ROW-${String(++maxCount).padStart(3,'0')}`,datetime_jst:date,asset:normalizeAsset(data.asset),amount,original_amount:amountRaw,txid:data.txid||'',address:data.address||'',category:data.category||'unclassified',notes:data.notes||'',source:data.source||'CSV',included:data.included?(/^(1|true|yes)$/i.test(data.included)):selectedDefault(data),manualPrice:data.price_jpy?Number(data.price_jpy):null,manualSource:data.price_source||''});
    }else{
      const a=normalizeAsset(data.asset),d=data.date_utc||data.day_utc||data.date,px=Number(data.price_jpy||data.jpy||data.close);
      if(a&&/^\d{4}-\d\d-\d\d$/.test(d)&&Number.isFinite(px)&&px>0)latestQuotes.set(priceKey(a,d),{price:px,source:data.source||'価格CSV',timestamp:new Date().toISOString()});else invalid++;
    }count++;
   }
  });
  if(mode==='rows'){rows=latestRows;currentPage=0;updateFilters();}else{for(const [k,v] of latestQuotes)quotes.set(k,v);}
  render();setStatus(`${mode==='rows'?rows.length:latestQuotes.size}件を読み込みました。不正行 ${invalid}件。`);
 }catch(e){setStatus('CSV読込エラー：'+String(e.message||e)+'。元の表示データは保持しました。');}
 finally{loadBusy=false;fileButtons.forEach(x=>x.disabled=false);}
}
function csvCell(v){let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'}
function makeCSV(arr,fields){return '\ufeff'+fields.join(',')+'\r\n'+arr.map(r=>fields.map(k=>csvCell(r[k])).join(',')).join('\r\n')+'\r\n'}
function dl(name,body){const blob=new Blob([body],{type:'text/csv;charset=utf-8'}),link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=name;document.body.append(link);link.click();setTimeout(()=>{URL.revokeObjectURL(link.href);link.remove()},400)}
function UTCday(datetime){const m=String(datetime).match(/^(\d{4})[\/-](\d\d)[\/-](\d\d)\s+(\d\d):(\d\d)/);if(!m)return '';let d=new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+09:00`);return Number.isFinite(d.getTime())?d.toISOString().slice(0,10):''}
const normalizeAsset=a=>String(a||'').toUpperCase().trim().replace(/\s*\(ERC20\)/i,'');
const priceKey=(a,d)=>`${normalizeAsset(a)}|${d}`;
function selectedDefault(r){return r.category==='onchain_reported' || !r.category}
function importRows(items){let errors=[];const cleaned=items.map((r,i)=>{const date=r.datetime_jst||r.date_jst||r.date||'',amt=Number(String(r.amount||'').replaceAll(',',''));if(!UTCday(date)||!r.asset||!Number.isFinite(amt)||amt<0){errors.push(i+2);return null};return {id:r.id||`ROW-${String(i+1).padStart(3,'0')}`,datetime_jst:date,asset:normalizeAsset(r.asset),amount:amt,original_amount:r.amount,txid:r.txid||'',address:r.address||'',category:r.category||'unclassified',notes:r.notes||'',source:r.source||'CSV',included:r.included?(/^(1|true|yes)$/i.test(r.included)):selectedDefault(r),manualPrice:r.price_jpy?Number(r.price_jpy):null,manualSource:r.price_source||''}}).filter(Boolean);rows=cleaned;updateFilters();render();setStatus(`${rows.length}行を読み込みました。${errors.length?'不正な行：'+errors.slice(0,12).join(','):''}`)}
function importPrices(items){let added=0,bad=0;items.forEach(r=>{const a=normalizeAsset(r.asset),d=r.date_utc||r.day_utc||r.date,px=Number(r.price_jpy||r.jpy||r.close);if(a&&/^\d{4}-\d\d-\d\d$/.test(d)&&px>0&&Number.isFinite(px)){quotes.set(priceKey(a,d),{price:px,source:r.source||'輸入価格CSV',timestamp:new Date().toISOString()});added++}else bad++});render();setStatus(`価格 ${added}件を読込み（無効 ${bad}件）。取引にはマッチするUTC日付の価格を適用。`)}
const getPrice=r=>{if(r.manualPrice>0&&Number.isFinite(r.manualPrice))return {price:r.manualPrice,source:r.manualSource||'手動入力',date:UTCday(r.datetime_jst)};const d=UTCday(r.datetime_jst),v=quotes.get(priceKey(r.asset,d));return v?{...v,date:d}:null};
function setStatus(msg){$('progress').textContent=msg}
function updateFilters(){const c=$('coinFilter'),old=c.value;c.textContent='';let opt=document.createElement('option');opt.value='';opt.textContent='すべて';c.append(opt);[...new Set(rows.map(r=>r.asset))].sort().forEach(a=>{let o=document.createElement('option');o.value=o.textContent=a;c.append(o)});c.value=old}
function render(){let applicable=rows.filter(r=>r.included&&r.amount>0),priced=applicable.filter(r=>getPrice(r));$('totalRows').textContent=nfmt(rows.length);$('includedRows').textContent=nfmt(applicable.length);$('pricedRows').textContent=`${priced.length} / ${applicable.length}`;let total=priced.reduce((v,r)=>v+r.amount*getPrice(r).price,0);$('totalYen').textContent=priced.length?currency(total):'未計算';$('totalContext').textContent=priced.length===applicable.length&&priced.length?'選択対象の全件に単価あり（参考評価額）':'価格のない評価対象は含まない部分計（損害額ではない）';
const term=$('filter').value.toLowerCase(),asset=$('coinFilter').value,st=$('stateFilter').value;let view=rows.filter(r=>(!asset||r.asset===asset)&&(!term||[r.id,r.asset,r.datetime_jst,r.txid,r.notes,r.address].join(' ').toLowerCase().includes(term))&&(!st||(st==='priced'&&!!getPrice(r))||(st==='unpriced'&&!getPrice(r))||(st==='included'&&r.included)||(st==='excluded'&&!r.included)));
const pageCount=Math.max(1,Math.ceil(view.length/PAGE_SIZE));currentPage=Math.min(currentPage,pageCount-1);const start=currentPage*PAGE_SIZE;const visible=view.slice(start,start+PAGE_SIZE);const tbody=$('tbody');tbody.textContent='';const fragment=document.createDocumentFragment();visible.forEach(r=>{const tr=document.createElement('tr');if(!r.included)tr.className='dim';function td(s,className){const x=document.createElement('td');x.textContent=s;if(className)x.className=className;tr.append(x);return x}
const t=document.createElement('td');let chk=document.createElement('input');chk.type='checkbox';chk.checked=r.included;chk.className='inlinecheck';chk.title='この行を評価対象に含める';chk.addEventListener('change',()=>{r.included=chk.checked;render()});t.append(chk);tr.append(t);td(r.datetime_jst);td(r.asset);td(r.original_amount,'amount');const ti=document.createElement('td'),pi=document.createElement('input');pi.className='editprice';pi.type='number';pi.step='any';pi.min='0';pi.placeholder=getPrice(r)?String(getPrice(r).price):'未取得';pi.value=r.manualPrice>0?String(r.manualPrice):'';pi.title=getPrice(r)?.source||'価格未取得';pi.addEventListener('change',()=>{const v=Number(pi.value);r.manualPrice=v>0?v:null;render()});ti.append(pi);if(getPrice(r)){const div=document.createElement('div');div.className='hint';div.textContent=(r.manualPrice>0?'手動':'API/価格表')+' · '+UTCday(r.datetime_jst);ti.append(div)}tr.append(ti);const p=getPrice(r);td(p?currency(r.amount*p.price):'—',p?'value':'muted');const catText={onchain_reported:'TxID記載',review:'要確認',service_credit:'サービス内入金',zero:'数量0',unclassified:'未分類'};let state=td(catText[r.category]||r.category);state.title=r.notes;let meta=td((r.txid&&r.txid!=='-'?r.txid.slice(0,14)+'…':'TxID記載なし')+(r.notes?' · '+r.notes:''));meta.title=[r.txid,r.address,r.notes].filter(Boolean).join('\n');fragment.append(tr)});tbody.append(fragment);$('shown').textContent=`表示 ${view.length?start+1:0}〜${Math.min(view.length,start+PAGE_SIZE)} / 条件一致${view.length}件（全${rows.length}件）。ページ ${currentPage+1}/${pageCount}`;$('prevPage').disabled=currentPage===0;$('nextPage').disabled=currentPage>=pageCount-1}
$('fileCsv').addEventListener('change',async e=>{const f=e.target.files[0];if(f)await readLargeCsv(f,'rows');e.target.value=''});
$('filePrice').addEventListener('change',async e=>{const f=e.target.files[0];if(f)await readLargeCsv(f,'price');e.target.value=''});
$('prevPage').addEventListener('click',()=>{if(currentPage>0){currentPage--;render()}});
$('nextPage').addEventListener('click',()=>{currentPage++;render()});
['filter','coinFilter','stateFilter'].forEach(x=>$(x).addEventListener('input',render));
$('fetchPrices').addEventListener('click',async()=>{if(!rows.length){setStatus('先に取引CSVを読み込んでください');return}const symbols=[...new Set(rows.map(r=>r.asset))].filter(a=>!['IZKY','AKC'].includes(a));if(symbols.length>MAX_SYMBOLS){setStatus('価格APIの負荷を抑えるため100通貨まで一括照会できます。手動価格CSVなら制限はありません。');return}const last=Math.max(...rows.map(r=>new Date(UTCday(r.datetime_jst)+'T00:00:00Z').getTime()).filter(Number.isFinite));let finish=Math.floor(last/1000)+86400,success=0,fail=[];const btn=$('fetchPrices');btn.disabled=true;for(let i=0;i<symbols.length;i++){const a=symbols[i];setStatus(`公開価格APIに照会中 ${i+1}/${symbols.length}：${a}（取得できた行だけ評価）`);try{const url=`https://min-api.cryptocompare.com/data/v2/histoday?fsym=${encodeURIComponent(a)}&tsym=JPY&limit=950&toTs=${finish}&extraParams=EVIDENCE_TRACER_VALUATION`;const res=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!res.ok)throw Error('HTTP '+res.status);const data=await res.json();if(data.Response==='Error')throw Error(data.Message||'API error');const bars=data.Data?.Data;if(!Array.isArray(bars)||!bars.length)throw Error('日足データなし');let ct=0;for(const bar of bars){if(Number(bar.close)>0&&Number.isFinite(bar.time)){const d=new Date(bar.time*1000).toISOString().slice(0,10);quotes.set(priceKey(a,d),{price:Number(bar.close),source:'CryptoCompare histoday JPY UTC daily close',timestamp:new Date().toISOString()});ct++}}if(ct)success++;else fail.push(a+':有効価格なし')}catch(e){fail.push(a+':'+String(e.message||e))}render()}btn.disabled=false;setStatus(`価格API：${success}/${symbols.length}通貨に価格データ取得。${fail.length?'要確認 '+fail.join(' / '):'処理完了'}。AKC・IZKYは個別調査・手動単価が必要です。`)});
$('export').addEventListener('click',()=>{if(!rows.length)return;const out=rows.map(r=>{const p=getPrice(r);return {id:r.id,datetime_jst:r.datetime_jst,price_date_utc:UTCday(r.datetime_jst),asset:r.asset,amount:r.original_amount,include_in_valuation:r.included?'yes':'no',price_jpy:p?.price??'',estimated_value_jpy:p?(r.amount*p.price).toFixed(2):'',price_source:p?.source||'',price_checked_at_utc:p?.timestamp||'',txid:r.txid,address:r.address,category:r.category,notes:r.notes,original_source:r.source}});dl('crypto_deposit_jpy_valuation.csv',makeCSV(out,Object.keys(out[0])))});
$('exportPrice').addEventListener('click',()=>{if(!quotes.size)return setStatus('価格データがありません');const out=[...quotes].map(([key,v])=>({date_utc:key.split('|')[1],asset:key.split('|')[0],price_jpy:v.price,source:v.source,checked_at_utc:v.timestamp||''}));dl('historical_price_evidence.csv',makeCSV(out,Object.keys(out[0])))});
$('template').addEventListener('click',()=>dl('transaction_template.csv',makeCSV([{datetime_jst:'2024/01/05 12:00',asset:'BTC',amount:'0.01',txid:'',address:'',category:'onchain_reported',notes:'例：これはサンプルです'}],['datetime_jst','asset','amount','txid','address','category','notes'])));
$('clear').addEventListener('click',()=>{if(!confirm('画面上の取引と価格の一時データを消去しますか？'))return;rows=[];quotes.clear();updateFilters();render();setStatus('初期化しました。取引CSVを読み込んでください。')});
render();

$('printPage').addEventListener('click',()=>window.print());
