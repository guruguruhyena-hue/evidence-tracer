'use strict';
/* Offline conversion of user-provided IZAKA-YA HTML print PDFs and CSVs.
   Not an on-chain payment verifier. Output must be reviewed against originals. */
(function(root){
const STANDARD=['id','datetime_jst','type','asset','amount','txid','address','destination_tag','category','notes','source','source_page','source_sha256','confidence'];
const VALUATION=['id','datetime_jst','asset','amount','txid','address','category','notes','source','source_page','source_sha256'];
const normalizeAsset=s=>String(s||'').toUpperCase().trim().replace(/\((ERC20|BEP20|TRC20|SPL)\)/gi,'').trim();
const isDecimal=s=>/^(?:0|[0-9]+)(?:\.[0-9]+)?$/.test(String(s||'').replace(/,/g,''));
const dateOK=s=>/^\d{4}\/\d\d\/\d\d \d\d:\d\d$/.test(s)&&!Number.isNaN(Date.parse(s.replace(/\//g,'-').replace(' ','T')+':00+09:00'));
function parsePdfPages(pages,filename,sha){
 const records=[],warnings=[];let candidateCount=0;
 for(const page of pages){
  // Tolerate PDF.js splitting Japanese into individual glyphs.
  const compact=String(page.text||'').replace(/\s+/g,'').replace(/\u00a0/g,'');
  const dates=[...compact.matchAll(/20\d{2}\/\d{2}\/\d{2}\d{2}:\d{2}/g)];
  for(let k=0;k<dates.length;k++){
   const match=dates[k],start=match.index,stop=k+1<dates.length?dates[k+1].index:compact.length;
   const body=compact.slice(start+match[0].length,stop);
   if(body.includes('履歴｜IZAKA-YA')||body.slice(0,35).includes('履歴|IZAKA-YA'))continue;
   const dt=match[0].slice(0,10)+' '+match[0].slice(10);
   const amountMatch=body.match(/([\d,]+(?:\.\d+)?)([A-Za-z][A-Za-z0-9]*)(?:\([^)]*\))?(?:を入金しました|を送金しました|の融資が終了しました|の融資を開始しました|を交換しました)/);
   const kind=body.includes('を入金しました')?'deposit':
     body.includes('を送金しました')?'withdrawal_sent':
     body.includes('の融資を開始しました')?'lending_start':
     body.includes('の融資が終了しました')?'lending_end':
     body.includes('を交換しました')?'exchange':'';
   if(!kind)continue;
   candidateCount++;
   if(!dateOK(dt)||!amountMatch||!isDecimal(amountMatch[1])){warnings.push('p'+page.page+' '+dt+': 数量または日時の解析不可');continue;}
   const amount=amountMatch[1].replace(/,/g,''),asset=normalizeAsset(amountMatch[2]);
   const address=(body.match(/(?:受信Walletアドレス|送信Walletアドレス|送信先Walletアドレス|送金先Walletアドレス|送金先アドレス):([^]+?)(?=受信宛先タグ:|送信宛先タグ:|TxID:|20\d{2}\/|$)/)||[])[1]||'';
   const tag=(body.match(/(?:受信宛先タグ|送信宛先タグ):([^]+?)(?=TxID:|20\d{2}\/|$)/)||[])[1]||'';
   const tx=(body.match(/TxID:([^]+?)(?=20\d{2}\/|$)/)||[])[1]||'';
   const txid=tx.trim().split(/(?=CryptoPanda|履歴)/)[0].trim().replace(/^-$/,'');
   const yieldMatch=body.match(/利益は([\d,]+(?:\.\d+)?)([A-Za-z][A-Za-z0-9]*)です/);
   const confidence=(kind==='deposit'||kind==='withdrawal_sent')&&!txid?'REVIEW_MISSING_TXID':'PARSED_REVIEW_REQUIRED';
   const record={
    id:'IZK-PDF-'+String(records.length+1).padStart(5,'0'),
    datetime_jst:dt,type:kind,asset,amount,txid,address:address.trim(),destination_tag:tag.trim(),
    category:kind==='deposit'?'review':kind,
    notes:yieldMatch?'融資終了・記載利益 '+yieldMatch[1].replace(/,/g,'')+' '+normalizeAsset(yieldMatch[2]):'',
    source:filename,source_page:String(page.page),source_sha256:sha,confidence
   };
   records.push(record);
  }
 }
 return {records,warnings,candidateCount};
}
function parseCsv(text){
 const rows=[];let row=[],cell='',quoted=false;
 text=String(text||'').replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else quoted=false;}else cell+=c;}
  else if(c==='"')quoted=true;
  else if(c===','){row.push(cell);cell='';}
  else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);cell='';if(row.some(v=>v!==''))rows.push(row);row=[];}
  else cell+=c;
 }
 if(quoted)throw Error('閉じていないCSVの引用符があります');
 if(cell!==''||row.length){row.push(cell);rows.push(row);}
 if(!rows.length)return [];
 const headers=rows.shift().map(h=>h.trim().toLowerCase());if(new Set(headers).size!==headers.length)throw Error('CSVの列名が重複しています');
 return rows.map((record,i)=>Object.fromEntries(headers.map((name,j)=>[name,record[j]??''])));
}
function standardizeCsv(rows,filename){
 return rows.map((r,i)=>{
  const dt=r.datetime_jst||r.date_jst||r.date||r.datetime||'',amount=(r.amount||r.quantity||r.value||'').replace(/,/g,'');
  const type=String(r.type||r.transaction_type||'deposit').trim().toLowerCase();
  return {
   id:r.id||'CSV-'+String(i+1).padStart(5,'0'),
   datetime_jst:dt,type,asset:normalizeAsset(r.asset||r.currency||r.coin),
   amount,txid:r.txid||r.tx_hash||r.hash||'',address:r.address||r.destination_address||r.wallet||'',
   destination_tag:r.destination_tag||r.tag||'',category:r.category||(type==='deposit'?'review':type),
   notes:r.notes||'',source:r.source||filename,source_page:r.source_page||'',source_sha256:r.source_sha256||'',
   confidence:dateOK(dt)&&isDecimal(amount)?'CSV_REVIEW_REQUIRED':'INVALID_FIELDS'
  };
 });
}
function parseOrder(text,allowed){
 const fields=String(text||'').split(',').map(v=>v.trim()).filter(Boolean);
 if(!fields.length||fields.length!==new Set(fields).size)throw Error('列が空、または重複しています');
 const unknown=fields.filter(f=>!allowed.includes(f));
 if(unknown.length)throw Error('未対応の列名: '+unknown.join(','));
 return fields;
}
function csvCell(value){
 let s=String(value??'');
 if(/^[=+\-@\t\r]/.test(s))s="'"+s; // Spreadsheet formula injection guard
 return '"'+s.replace(/"/g,'""')+'"';
}
function toCsv(rows,columns){
 return '\uFEFF'+columns.join(',')+'\r\n'+rows.map(r=>columns.map(k=>csvCell(r[k])).join(',')).join('\r\n')+'\r\n';
}
function safeValuationRows(records){
 return records.filter(r=>r.type==='deposit'&&r.confidence!=='INVALID_FIELDS').map(r=>({
 ...r,category:r.category==='deposit'?'review':r.category,
 notes:[r.notes,'PDF/CSV抽出（原本要確認）'].filter(Boolean).join('; ')
 }));
}
function reconcile(deposits,withdrawals){
 const assets=[...new Set([...deposits,...withdrawals].map(r=>r.asset).filter(Boolean))].sort();
 return assets.map(asset=>{
  const d=deposits.filter(r=>r.type==='deposit'&&r.asset===asset&&isDecimal(r.amount));
  const w=withdrawals.filter(r=>['withdrawal_sent','withdrawal_pending'].includes(r.type)&&r.asset===asset&&isDecimal(r.amount));
  return {asset,deposits:d.length,withdrawal_records:w.length,
    deposit_quantity:decimalSum(d.map(r=>r.amount)),withdrawal_recorded_quantity:decimalSum(w.map(r=>r.amount)),
    comment:'異なる時点・内部交換・利息・手数料・再入金を考慮していない単純な履歴集計。出金記録は実着金の証明ではありません。'};
 });
}
function decimalSum(values){
 let total=0n,scale=0;for(const raw of values){
  if(!isDecimal(raw))continue;
  const [whole,frac='']=String(raw).replace(/,/g,'').split('.');
  if(frac.length>scale){total*=10n**BigInt(frac.length-scale);scale=frac.length;}
  total+=BigInt(whole+frac)*10n**BigInt(scale-frac.length);
 }
 if(!scale)return String(total);
 let s=total.toString().padStart(scale+1,'0');return (s.slice(0,-scale)+'.'+s.slice(-scale)).replace(/\.?0+$/,'')||'0';
}
root.IzkHistory={STANDARD,VALUATION,parsePdfPages,parseCsv,standardizeCsv,parseOrder,toCsv,safeValuationRows,reconcile,decimalSum};
})(globalThis);
