'use strict';
(function(){
const H=globalThis.IzkHistory,$=id=>document.getElementById(id);
let datasets={a:[],b:[]},meta={a:null,b:null},warnings={a:[],b:[]};
const MAX_FILE=35*1024*1024;
const safe=val=>String(val??'');
function message(text){$('progress').textContent=text}
async function hexHash(buffer){
 const digest=await crypto.subtle.digest('SHA-256',buffer);
 return [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
}
async function pdfPages(file){
 const mod=await import('./vendor/pdf.mjs');
 mod.GlobalWorkerOptions.workerSrc='./vendor/pdf.worker.mjs';
 const bytes=await file.arrayBuffer(),hash=await hexHash(bytes);
 const pdf=await mod.getDocument({data:new Uint8Array(bytes)}).promise;
 const pages=[];
 try{
  if(pdf.numPages>150)throw Error('PDFは最大150頁までです。分割して読み込んでください。');
  for(let n=1;n<=pdf.numPages;n++){
   const page=await pdf.getPage(n),content=await page.getTextContent(),items=[];
   for(const item of content.items){
    if(!item.str)continue;
    const t=item.transform||[];
    items.push({s:item.str,x:Number(t[4]||0),y:Number(t[5]||0)});
   }
   items.sort((a,b)=>Math.abs(b.y-a.y)>2.5?b.y-a.y:a.x-b.x);
   let lines=[],line=[],ly;
   for(const item of items){
    if(ly===undefined||Math.abs(item.y-ly)<=2.5){line.push(item);ly=ly??item.y;}
    else{line.sort((a,b)=>a.x-b.x);lines.push(line.map(v=>v.s).join(' '));line=[item];ly=item.y;}
   }
   if(line.length){line.sort((a,b)=>a.x-b.x);lines.push(line.map(v=>v.s).join(' '));}
   pages.push({page:n,text:lines.join('\n')});
   message(file.name+': PDFを解析中 '+n+'/'+pdf.numPages+'ページ');
  }
 }finally{try{await pdf.destroy()}catch{}}
 return {pages,hash};
}
async function readFile(file,slot){
 if(!file)return;
 if(file.size>MAX_FILE){message('ファイルが35MBを超えています。分割してください。');return;}
 const input=$('file'+slot.toUpperCase());input.disabled=true;
 const previous=datasets[slot],previousMeta=meta[slot];
 try{
  let parsed;
  if(/\.pdf$/i.test(file.name)||file.type==='application/pdf'){
   const pdf=await pdfPages(file);
   parsed=H.parsePdfPages(pdf.pages,file.name,pdf.hash);
   parsed.meta={filename:file.name,sha256:pdf.hash,format:'PDF',pages:pdf.pages.length};
   if(!parsed.records.length&&pdf.pages.some(p=>p.text.trim()))parsed.warnings.push('履歴表現を認識できませんでした。PDFと対応する抽出対象が異なる可能性があります。');
   if(!pdf.pages.some(p=>p.text.trim()))parsed.warnings.push('画像PDFのためテキスト抽出不可。OCRが必要です。');
  }else{
   const text=await file.text(),hash=await hexHash(await file.arrayBuffer());
   const original=H.parseCsv(text),records=H.standardizeCsv(original,file.name);
   parsed={records,warnings:records.filter(r=>r.confidence==='INVALID_FIELDS').map(r=>r.id+':日時／数量に問題あり'),
     meta:{filename:file.name,sha256:hash,format:'CSV',rows:original.length}};
  }
  if(!parsed.records.length){message('抽出0件：元データを変更しません。'+(parsed.warnings.join(' / ')||'ファイル形式を確認してください。'));return;}
  datasets[slot]=parsed.records;
  meta[slot]=parsed.meta;
  warnings[slot]=parsed.warnings||[];
  message(file.name+': '+parsed.records.length+'件を読み込みました。PDF抽出結果は原本と照合してください。');
  draw();
 }catch(err){
  datasets[slot]=previous;meta[slot]=previousMeta;
  message('解析エラー: '+String(err?.message||err)+'（前のデータは保持しました）');
 }finally{input.disabled=false;}
}
function currentRows(){
 const mode=$('dataset').value;
 const all=mode==='a'?datasets.a:mode==='b'?datasets.b:datasets.a.concat(datasets.b);
 return mode==='valuation'?H.safeValuationRows(all):all;
}
function allowedColumns(){return $('dataset').value==='valuation'?H.VALUATION:H.STANDARD}
function resetColumns(){$('columns').value=allowedColumns().join(', ')}
function download(name,contents,mime){
 const url=URL.createObjectURL(new Blob([contents],{type:mime||'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();
 setTimeout(()=>{a.remove();URL.revokeObjectURL(url)},30000);
}
function draw(){
 $('countA').textContent=String(datasets.a.length);
 $('countB').textContent=String(datasets.b.length);
 const combined=datasets.a.concat(datasets.b);
 const pending=combined.filter(r=>/INVALID|MISSING|REVIEW/.test(r.confidence));
 $('countWarnings').textContent=String(pending.length+warnings.a.length+warnings.b.length);
 $('countAssets').textContent=String(new Set(combined.map(r=>r.asset).filter(Boolean)).size);
 const preview=$('preview');preview.textContent='';
 const frag=document.createDocumentFragment();
 for(const record of currentRows().slice(0,100)){
  const tr=document.createElement('tr');
  for(const field of ['source','source_page','datetime_jst','type','asset','amount','txid','confidence']){
   const td=document.createElement('td');td.textContent=safe(record[field]);tr.append(td);
  }
  frag.append(tr);
 }
 preview.append(frag);
 $('previewInfo').textContent='表示 '+Math.min(100,currentRows().length)+' / '+currentRows().length+'件。ファイルごとの抽出件数とPDF原本を確認してください。';
 $('warnings').textContent=warnings.a.concat(warnings.b).join('\n')||'パーサーの警告はありません。ただしPDF解析結果は必ず原本照合してください。';
 const summary=H.reconcile(combined,combined);
 window.__historyReconciliation=summary;
 const table=$('reconcile');table.textContent='';
 for(const rec of summary){
  const tr=document.createElement('tr');
  for(const v of [rec.asset,rec.deposits,rec.deposit_quantity,rec.withdrawal_records,rec.withdrawal_recorded_quantity,'実着金は未検証']){
   const td=document.createElement('td');td.textContent=String(v);tr.append(td);
  }
  table.append(tr);
 }
}
$('fileA').addEventListener('change',e=>{const f=e.target.files?.[0];if(f)readFile(f,'a');e.target.value='';});
$('fileB').addEventListener('change',e=>{const f=e.target.files?.[0];if(f)readFile(f,'b');e.target.value='';});
$('dataset').addEventListener('change',()=>{resetColumns();draw();});
$('resetOrder').addEventListener('click',resetColumns);
$('downloadCsv').addEventListener('click',()=>{
 try{
  const rows=currentRows();if(!rows.length)throw Error('抽出レコードがありません');
  const cols=H.parseOrder($('columns').value,allowedColumns());
  download($('dataset').value==='valuation'?'izakaya_valuation_import.csv':'izakaya_history_normalized.csv',H.toCsv(rows,cols));
  message(rows.length+'件をCSV出力しました。原本と照合してください。');
 }catch(e){message('CSV出力エラー: '+e.message)}
});
$('downloadJson').addEventListener('click',()=>{
 const obj={generated_at_utc:new Date().toISOString(),metadata:meta,records:datasets,warnings,
  caution:'Parsed from user-supplied originals. Does not establish actual withdrawal receipt or legal damages.'};
 download('izakaya_history_extraction.json',JSON.stringify(obj,null,2),'application/json;charset=utf-8');
});
$('downloadReconcile').addEventListener('click',()=>{
 const rows=window.__historyReconciliation||[];
 if(!rows.length)return message('先にPDFまたはCSVを読み込んでください');
 download('izakaya_history_asset_reconciliation.csv',H.toCsv(rows,['asset','deposits','deposit_quantity','withdrawal_records','withdrawal_recorded_quantity','comment']));
});
resetColumns();draw();
})();
