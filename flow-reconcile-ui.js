'use strict';
(function(){
const $=id=>document.getElementById(id),H=globalThis.IzkHistory,F=globalThis.IzkFlow;
const categories=['deposits','exchanges','lending','withdrawals'];
const stores=Object.fromEntries(categories.map(k=>[k,{rows:[],metadata:null,warnings:[]}]));
const MAX_BYTES=35*1024*1024;
let unifiedJournal=null;
let adjustments={rows:[],metadata:null,warnings:[]};
function status(msg){$('state').textContent=msg}
function exportFile(name,contents,type='text/csv;charset=utf-8'){
 const uri=URL.createObjectURL(new Blob([contents],{type})),a=document.createElement('a');
 a.href=uri;a.download=name;document.body.append(a);a.click();
 setTimeout(()=>{a.remove();URL.revokeObjectURL(uri)},30000);
}
async function digest(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('')}
async function extractPdf(file){
 const pdfjs=await import('./vendor/pdf.mjs');
 pdfjs.GlobalWorkerOptions.workerSrc='./vendor/pdf.worker.mjs';
 const bytes=await file.arrayBuffer(),sha=await digest(bytes);
 const doc=await pdfjs.getDocument({data:new Uint8Array(bytes)}).promise;
 const pages=[];
 try{
  if(doc.numPages>150)throw Error('PDFは150ページ以内に分割してください');
  for(let n=1;n<=doc.numPages;n++){
   const page=await doc.getPage(n),content=await page.getTextContent();
   const words=content.items.filter(x=>x&&typeof x.str==='string'&&x.str).map(x=>({
    text:x.str,x:Number(x.transform?.[4]||0),y:Number(x.transform?.[5]||0)
   })).sort((a,b)=>Math.abs(b.y-a.y)>2.5?b.y-a.y:a.x-b.x);
   const lines=[];let row=[],lastY=null;
   for(const w of words){
    if(lastY===null||Math.abs(w.y-lastY)<=2.5){row.push(w);lastY=lastY??w.y;}
    else{row.sort((a,b)=>a.x-b.x);lines.push(row.map(x=>x.text).join(' '));row=[w];lastY=w.y;}
   }
   if(row.length){row.sort((a,b)=>a.x-b.x);lines.push(row.map(x=>x.text).join(' '));}
   pages.push({page:n,text:lines.join('\n')});
   status('PDF解析中 '+file.name+' '+n+'/'+doc.numPages);
  }
 }finally{try{await doc.destroy()}catch{}}
 return {pages,sha};
}
function mapCsv(row,kind,i,file){
 const type=String(row.type||'').trim().toLowerCase();
 const implied=kind==='deposits'?'deposit':kind==='withdrawals'?'withdrawal_pending':'';
 const finalType=type||implied;
 const asset=String(row.asset||row.currency||row.coin||'').trim().toUpperCase().replace(/\s*\((ERC20|BEP20|TRC20)\)/gi,'');
 return {id:String(row.id||kind+'-'+(i+1)),datetime_jst:String(row.datetime_jst||row.date||row.datetime||''),
  type:finalType,asset,amount:String(row.amount||row.quantity||''),
  fee:String(row.fee||'0'),fee_asset:String(row.fee_asset||asset),pair_id:String(row.pair_id||''),
  status:String(row.status||'').trim(),txid:String(row.txid||row.tx_hash||''),source:String(row.source||file.name),
  source_page:String(row.source_page||''),notes:String(row.notes||'')};
}
async function readOne(file,kind){
 if(!file)return;
 if(file.size>MAX_BYTES){status('ファイルが35MB超のため読み込めません：'+file.name);return}
 try{
  let rows,warnings=[],metadata;
  if(/\.pdf$/i.test(file.name)||file.type==='application/pdf'){
   const x=await extractPdf(file);
   const parsed=H.parsePdfPages(x.pages,file.name,x.sha);
   const converted=F.fromPdfHistory(parsed.records);
   rows=converted.rows;warnings=[...parsed.warnings,...converted.warnings];
   metadata={file:file.name,sha256:x.sha,pages:x.pages.length,parsed_pdf_rows:parsed.records.length};
   const recognized=new Set(kind==='deposits'?['deposit']:kind==='lending'?['lending_start','lending_end','lending_profit']:kind==='withdrawals'?['withdrawal_sent']:[]);
   if(kind==='exchanges'||!recognized.size)warnings.unshift('このPDF種別には交換ペア／送金待の専用構造解析が未対応です。標準化CSVで入力してください');
   rows=rows.filter(r=>recognized.has(r.type));
   if(parsed.records.some(r=>!recognized.has(r.type)))warnings.push('選択スロットと異なる種別を含む記録は除外しました。原本のタブを確認してください');
   if(!rows.length)warnings.push('このPDFから対応仕訳が抽出できませんでした（0件）。別形式のCSVを使ってください');
  }else{
   const bytes=await file.arrayBuffer(),text=new TextDecoder('utf-8',{fatal:false}).decode(bytes);
   const source=H.parseCsv(text);
   rows=source.map((r,i)=>mapCsv(r,kind,i,file));
   metadata={file:file.name,sha256:await digest(bytes),csv_rows:source.length};
   const wrong=rows.filter(r=>!F.TYPES.has(r.type));
   if(wrong.length)warnings.push('type未対応 '+wrong.length+'件。入力形式を確認してください');
   if(kind==='exchanges'&&rows.some(r=>!['exchange_out','exchange_in'].includes(r.type)))
    warnings.push('交換CSVはexchange_outとexchange_inのペア行のみです。');
   if(kind==='withdrawals'&&rows.some(r=>!['withdrawal_sent','withdrawal_pending'].includes(r.type)))
    warnings.push('出金CSVはwithdrawal_sent / withdrawal_pending で分類してください');
  }
  const other=categories.find(x=>x!==kind&&stores[x].metadata?.sha256===metadata.sha256);
  if(other)throw Error('同一原本をすでに '+other+' に登録済みです。二重計上を避けました');
  if(unifiedJournal){unifiedJournal=null;$('journalState').textContent='個別帳簿の読込に切り替えました';}
  stores[kind]={rows,warnings,metadata};
  $(kind+'State').textContent=rows.length+'仕訳'+(warnings.length?'／確認事項'+warnings.length:'')+' · SHA-256 '+metadata.sha256.slice(0,12)+'…';
  render();status(file.name+'を読み込みました。仕訳'+rows.length+'件。確認事項は下部をご覧ください');
 }catch(e){status('読込失敗：'+String(e?.message||e)+'（それまでの仕訳を保持しました）')}
}
function collect(){return (unifiedJournal?unifiedJournal.rows:categories.flatMap(kind=>stores[kind].rows)).concat(adjustments.rows)}
function getReport(){
 const report=F.reconcile(collect());
 const missing=unifiedJournal?[]:categories.filter(kind=>!stores[kind].metadata);
 const warnings=categories.flatMap(kind=>stores[kind].warnings.map(v=>kind+': '+v)).concat(adjustments.warnings.map(v=>'adjustments: '+v));
 if(missing.length)warnings.unshift('未入力帳簿: '+missing.join(', ')+'。照合は未完成です。');
 if(!adjustments.metadata)warnings.push('過去の円転・返金・取消前の支払等が未入力です。ETH / USDT / JPYR等の推定値は調整前であり、確定残高ではありません。');
 return {...report,warnings:warnings.concat(report.warnings),complete:missing.length===0&&warnings.length===0&&report.warnings.length===0};
}
function drawTable(bodyId,rows,fields){
 const el=$(bodyId);el.textContent='';
 const frag=document.createDocumentFragment();
 for(const r of rows){
  const tr=document.createElement('tr');
  for(const field of fields){
   const td=document.createElement('td');td.textContent=String(r[field]??'');
   if(field.includes('qty')||field.includes('quantity')||field==='amount'||field==='fee')td.className='num';
   tr.append(td);
  }
  frag.append(tr);
 }
 el.append(frag);
}
let current=null;
function render(){
 current=getReport();
 $('nDeposits').textContent=current.totals.deposit_rows;
 $('nExchanges').textContent=current.totals.exchanges;
 $('nLoans').textContent=current.totals.loan_events;
 $('nWithdrawals').textContent=current.totals.withdrawal_records;
 const assets=current.assets.map(a=>({...a,
  other_qty:F.fmt(F.add(F.add(F.parseDecimal(a.merchant_refund_qty),F.parseDecimal(a.adjustment_qty)),{n:-F.parseDecimal(a.merchant_out_qty).n,s:F.parseDecimal(a.merchant_out_qty).s}))
 }));
 drawTable('assetRows',assets,['asset','deposit_qty','exchange_in_qty','exchange_out_qty','profit_qty','sent_qty','fee_qty','other_qty','net_pre_pending','pending_qty','pending_fee_quoted_qty']);
 const withdraw=stores.withdrawals.rows.filter(r=>r.type==='withdrawal_sent'||r.type==='withdrawal_pending').map(r=>({
  datetime_jst:r.datetime_jst,asset:r.asset,amount:r.amount,fee:r.fee,
  status:r.status||(r.type==='withdrawal_sent'?'サービス送金済表示':'送金待'),txid:r.txid||'—',
  chain_receipt:'未照合'
 }));
 drawTable('withdrawalRows',withdraw,['datetime_jst','asset','amount','fee','status','txid','chain_receipt']);
 $('warnings').textContent=current.warnings.join('\n')||'形式上の警告はありません。実際の着金確認は別途必要です。';
 return current;
}

async function importUnifiedJournal(file){
 if(!file)return;
 if(file.size>MAX_BYTES)return status('統合CSVが35MBを超えています');
 try{
  const bytes=await file.arrayBuffer(),original=H.parseCsv(new TextDecoder('utf-8').decode(bytes));
  if(!original.length||!['kind','asset','raw_amount','wallet_delta'].every(k=>Object.hasOwn(original[0],k)))
   throw Error('統合台帳の列（kind, asset, raw_amount, wallet_delta）が不足しています');
  const mapped=F.fromAuditJournal(original),tested=F.reconcile(mapped);
  if(tested.totals.valid_rows!==mapped.length)throw Error('仕訳が無効です: '+tested.warnings.slice(0,4).join(' / '));
  const sha256=await digest(bytes);
  if(adjustments.metadata?.sha256===sha256)throw Error('調整CSVと同一の原本は登録できません');
  unifiedJournal={rows:mapped,metadata:{file:file.name,sha256,rows:original.length},warnings:tested.warnings};
  for(const category of categories){stores[category]={rows:[],warnings:[],metadata:null};$(category+'State').textContent='統合台帳を使用';}
  $('journalState').textContent=mapped.length+'仕訳 · SHA-256 '+sha256.slice(0,12)+'…';
  render();status('統合台帳 '+mapped.length+'仕訳を検証して読み込みました。円転・返金調整の有無を確認してください。');
 }catch(e){status('統合台帳の読込エラー: '+String(e.message||e))}
}
async function importAdjustments(file){
 if(!file)return;
 if(file.size>MAX_BYTES)return status('調整CSVが35MBを超えています');
 try{
  const bytes=await file.arrayBuffer(),raw=H.parseCsv(new TextDecoder('utf-8').decode(bytes));
  if(!raw.length)throw Error('空のCSVです');
  const allowed=new Set(['merchant_out','merchant_refund','adjustment_in','adjustment_out']);
  const rows=raw.map((r,i)=>mapCsv(r,'adjustments',i,file));
  const invalid=rows.filter(r=>!allowed.has(r.type));
  if(invalid.length)throw Error('調整CSVに許可されないtypeがあります: '+invalid.slice(0,4).map(r=>r.type).join(','));
  const tested=F.validate(rows);
  if(tested.errors.length)throw Error(tested.errors.slice(0,4).join(' / '));
  const sha256=await digest(bytes);
  if(unifiedJournal?.metadata.sha256===sha256||categories.some(k=>stores[k].metadata?.sha256===sha256))throw Error('同じ原本は二重登録できません');
  adjustments={rows,metadata:{file:file.name,sha256,rows:rows.length},warnings:[]};
  $('adjustmentsState').textContent=rows.length+'仕訳 · SHA-256 '+sha256.slice(0,12)+'…';
  render();status('その他の調整 '+rows.length+'件を反映しました。対応取引の重複がないか元資料で確認してください。');
 }catch(e){status('調整CSVの読込エラー: '+String(e.message||e))}
}
$('journalFile').addEventListener('change',e=>{const file=e.target.files?.[0];if(file)void importUnifiedJournal(file);e.target.value='';});
$('adjustmentsFile').addEventListener('change',e=>{const file=e.target.files?.[0];if(file)void importAdjustments(file);e.target.value='';});
for(const kind of categories){
 const el=$(kind+'File');
 el.addEventListener('change',()=>{const file=el.files?.[0];if(file)void readOne(file,kind);el.value='';});
}
$('recompute').addEventListener('click',()=>{render();status('照合を再計算しました。未入力・未確認の警告を確認してください。')});
$('exportAssets').addEventListener('click',()=>{
 const x=render();if(!x.assets.length)return status('先に履歴を読み込んでください');
 exportFile('izakaya_asset_flow_reconciliation.csv',H.toCsv(x.assets,
 ['asset','deposits','deposit_qty','exchange_in','exchange_in_qty','exchange_out','exchange_out_qty','profits','profit_qty','withdrawals_sent','sent_qty','withdrawals_pending','pending_qty','pending_fee_quoted_qty','fees','fee_qty','merchant_out_qty','merchant_refund_qty','adjustment_qty','net_pre_pending']));
});
$('exportEvents').addEventListener('click',()=>{
 const x=render();if(!x.events.length)return status('仕訳がありません');
 exportFile('izakaya_flow_events.csv',H.toCsv(x.events,['id','type','asset','quantity','delta','classification']));
});
$('exportJson').addEventListener('click',()=>{
 const x=render();exportFile('izakaya_flow_reconciliation.json',JSON.stringify({
  generated_at_utc:new Date().toISOString(),sources:Object.fromEntries(categories.map(k=>[k,stores[k].metadata]).concat([['unified_journal',unifiedJournal?.metadata||null],['adjustments',adjustments.metadata]])),
  analysis:x,caution:'Local service ledger estimate. Neither on-chain transfer proof nor legal damages.'
 },null,2),'application/json;charset=utf-8');
});
$('downloadTemplate').addEventListener('click',()=>{
 const example=[
  {id:'EXAMPLE-D-1',datetime_jst:'2025/01/01 12:00',type:'deposit',asset:'BTC',amount:'0.1',status:'service_record'},
  {id:'EXAMPLE-X-1O',datetime_jst:'2025/01/02 12:00',type:'exchange_out',asset:'BTC',amount:'0.01',pair_id:'EXAMPLE-X-1'},
  {id:'EXAMPLE-X-1I',datetime_jst:'2025/01/02 12:00',type:'exchange_in',asset:'ETH',amount:'0.3',pair_id:'EXAMPLE-X-1'},
  {id:'EXAMPLE-L-S',datetime_jst:'2025/01/03 12:00',type:'lending_start',asset:'ETH',amount:'0.3'},
  {id:'EXAMPLE-L-E',datetime_jst:'2025/02/03 12:00',type:'lending_end',asset:'ETH',amount:'0.3'},
  {id:'EXAMPLE-L-P',datetime_jst:'2025/02/03 12:00',type:'lending_profit',asset:'ETH',amount:'0.003'},
  {id:'EXAMPLE-W-S',datetime_jst:'2025/02/04 12:00',type:'withdrawal_sent',asset:'ETH',amount:'0.1',fee:'0.001',fee_asset:'ETH',status:'service_sent_unverified'},
  {id:'EXAMPLE-W-P',datetime_jst:'2025/02/05 12:00',type:'withdrawal_pending',asset:'ETH',amount:'0.2',status:'pending'}
 ];
 exportFile('izakaya_flow_template_EXAMPLE_ONLY.csv',H.toCsv(example,F.FIELDS));
});
render();
})();
