'use strict';
/* Optional police audit controls. Independent arithmetic lives in valuation-audit.js. */
(function(){
 const $=id=>document.getElementById(id),A=globalThis.ValuationAudit;
 const counts=()=>({MATCH:0,SOURCE_UNDOCUMENTED:0,MISSING_PRICE:0,EXCLUDED:0,MISMATCH:0,INVALID_ROW:0});
 function entry(r){
  const p=getPrice(r);
  return {id:r.id,datetime_jst:r.datetime_jst,price_date_utc:UTCday(r.datetime_jst),asset:r.asset,
   amount:r.original_amount,include_in_valuation:r.included?'yes':'no',
   price_jpy:p?.price??'',estimated_value_jpy:p?centsString(centsOf(r.original_amount,p.price)):'',
   price_source:p?.source||'',price_source_url:p?.sourceUrl||'',price_source_sha256:p?.sourceSha256||'',
   price_evidence_ref:p?.evidenceRef||'',price_method:p?.method||'',
   price_checked_at_utc:p?.timestamp||'',txid:r.txid,address:r.address,category:r.category,
   notes:r.notes,original_source:r.source};
 }
 function saveText(name,text,type='text/plain;charset=utf-8'){
  const link=document.createElement('a'),url=URL.createObjectURL(new Blob([text],{type}));
  link.href=url;link.download=name;document.body.append(link);link.click();
  setTimeout(()=>{link.remove();URL.revokeObjectURL(url)},60000);
 }
 async function audit(){
  if(!A){setStatus('検算プログラムが配信されていません。ページを更新してください。');return;}
  if(loadBusy||!rows.length){setStatus('検算前に取引CSVを正常に読み込んでください。');return;}
  const button=$('auditAndExport');button.disabled=true;
  const tally=counts(),issues=[],sources=new Map();let subtotal=0n;
  try{
   for(let i=0;i<rows.length;i++){
    const r=entry(rows[i]),result=A.compareRow(r);
    tally[result.status]++;
    if(result.status==='MATCH'||result.status==='SOURCE_UNDOCUMENTED')subtotal+=A.independentlyRoundedCents(r.amount,r.price_jpy);
    if(result.status!=='MATCH'&&result.status!=='EXCLUDED'&&issues.length<100)issues.push({row_id:r.id,status:result.status,reason:result.reason});
    if(r.price_jpy){
     const key=[r.asset,r.price_date_utc,r.price_source,r.price_source_url,r.price_source_sha256,r.price_evidence_ref].join('|');
     if(!sources.has(key))sources.set(key,{asset:r.asset,day:r.price_date_utc,source:r.price_source,url:r.price_source_url,source_sha256:r.price_source_sha256,evidence_ref:r.price_evidence_ref,method:r.price_method,checked_at_utc:r.price_checked_at_utc});
    }
    if(i%3000===0){setStatus('独立検算中：'+i+'/'+rows.length);await new Promise(resolve=>setTimeout(resolve,0));}
   }
   const meta={title:'暗号資産入金時価評価・検算記録',version:'1.0',generated_at_utc:new Date().toISOString(),
    original_transaction_filename:sourceFileName||'',original_transaction_sha256:sourceFileSHA||'NOT_CALCULATED',
    original_quote_filename:priceFileName||'',original_quote_sha256:priceFileSHA||'NOT_CALCULATED',
    rows:rows.length,status_counts:tally,subtotal_jpy_AUDIT_ONLY:A.decimalCents(subtotal),
    formula:A.POLICY,investigator_note:$('investigatorMemo').value.slice(0,180),
    sources:[...sources.values()].slice(0,10000),issues_first_100:issues,
    caveat:'Arithmetical self-check and presence of source reference only; neither market quote authenticity nor transaction validity is confirmed.'};
   const explanation=[
    '暗号資産・入金時価評価　参考計算および独立検算の説明書',
    '出力UTC：'+meta.generated_at_utc,
    '原取引CSV：'+(sourceFileName||'不明')+' SHA-256：'+(sourceFileSHA||'未計算'),
    '原価格CSV：'+(priceFileName||'API・手動')+' SHA-256：'+(priceFileSHA||'未計算'),
    '評価時点：日本時間の入金日時から対応するUTC日付を決定。日足終値による参考評価であり入金瞬間の価格ではない。',
    '計算方法：取引数量×1通貨のJPY単価。各行を0.01円単位でROUND_HALF_UP四捨五入後、整数の銭単位で合算。',
    '検算方法：別実装のBigIntによる商・余り方式で取引ごとに再計算。',
    '検算結果：計算一致かつ出典の参照情報あり '+tally.MATCH+'件／出典情報不足 '+tally.SOURCE_UNDOCUMENTED+
     '件／価格未取得 '+tally.MISSING_PRICE+'件／除外 '+tally.EXCLUDED+'件／計算不一致 '+tally.MISMATCH+'件／無効 '+tally.INVALID_ROW+'件。',
    '部分計：'+A.decimalCents(subtotal)+'円（価格が取得できた評価対象のみ、損害額ではない）',
    '注意：「MATCH」は計算が一致したという意味であり、価格・銀行着金・オンチェーン送金・犯罪被害・請求額を認定しない。',
    '価格の出典は付属のvaluation_audit_manifest.jsonを参照。原本PDF、CSV、API応答等は別に保存する。',
    'メモ：'+meta.investigator_note
   ].join('\r\n');
   saveText('valuation_police_explanation.txt',explanation);
   saveText('valuation_audit_manifest.json',JSON.stringify(meta,null,2),'application/json;charset=utf-8');
   const fields=[...A.COLS,'independently_calculated_jpy','audit_status','audit_reason'];
   await exportLargeCSV('valuation_independent_audit.csv',rows,fields,r=>{
     const record=entry(r),check=A.compareRow(record);
     return {...record,independently_calculated_jpy:check.independent||'',audit_status:check.status,audit_reason:check.reason};
   });
   $('auditSummary').textContent='検算完了：'+rows.length+'件。MATCH '+tally.MATCH+
     '／出典不足 '+tally.SOURCE_UNDOCUMENTED+'／価格なし '+tally.MISSING_PRICE+
     '／不一致 '+tally.MISMATCH+'。参考部分計 '+A.decimalCents(subtotal)+'円。';
  }catch(e){setStatus('検算に失敗：'+String(e?.message||e));}
  finally{button.disabled=false;}
 }
 async function recheck(file){
  if(!A)return setStatus('検算プログラムが未配信です');
  if(loadBusy)return setStatus('CSV読み込み中です');
  if(file.size>MAX_CSV_BYTES)return setStatus('再検算ファイルは500MB以下にしてください。');
  const input=$('auditCsv');input.disabled=true;const tally=counts(),issues=[];let rowsSeen=0;
  let worker;try{worker=new Worker(new URL('./valuation-worker.js?v=20261124-police3',document.baseURI));}catch(e){input.disabled=false;return setStatus('再検算Worker起動失敗：'+String(e));}
  await new Promise(resolve=>{
   let done=false;const finish=msg=>{if(done)return;done=true;clearTimeout(timer);worker.terminate();input.disabled=false;setStatus(msg);resolve();};
   const timer=setTimeout(()=>finish('再検算タイムアウト'),90000);
   worker.onmessage=e=>{
    const m=e.data;
    if(m.type==='batch'){
     for(const row of m.rows){rowsSeen++;const result=A.compareRow(row);tally[result.status]++;
      if(result.status!=='MATCH'&&result.status!=='EXCLUDED'&&issues.length<100)issues.push({id:row.id,status:result.status,reason:result.reason});
     }
    }else if(m.type==='done'){
     const report={filename:file.name,checked_at_utc:new Date().toISOString(),rows:rowsSeen,counts:tally,issues_first_100:issues,
      description:'Independent recalculation only, not external verification of market prices'};
     saveText('valuation_recheck_result.json',JSON.stringify(report,null,2),'application/json;charset=utf-8');
     $('auditSummary').textContent='出力CSV再検算：'+rowsSeen+'件／MATCH '+tally.MATCH+
       '／出典不足 '+tally.SOURCE_UNDOCUMENTED+'／計算不一致 '+tally.MISMATCH+'／価格なし '+tally.MISSING_PRICE;
     finish('再検算完了：'+rowsSeen+'件');
    }else if(m.type==='error')finish('再検算エラー：'+m.message);
   };
   worker.onerror=e=>finish('Worker配信エラー：'+(e.message||'unknown'));
   worker.postMessage({type:'import',id:'audit',file});
  });
 }
 $('auditAndExport').addEventListener('click',audit);
 $('auditCsv').addEventListener('change',async e=>{const file=e.target.files[0];if(file)await recheck(file);e.target.value='';});
})();
