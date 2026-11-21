(()=>{'use strict';
const $=id=>document.getElementById(id);
const withdrawals=[],evidence=[];
let reconciliation=null;
let importedRecord=false;
const el=(tag,text)=>{const e=document.createElement(tag);e.textContent=String(text??'');return e;};
function row(cells,parent,deleteFn){
 const tr=document.createElement('tr');cells.forEach(value=>{const td=el('td',value);if(String(value).length>32)td.classList.add('breakable');tr.append(td);});
 if(deleteFn){const td=document.createElement('td'),b=el('button','削除');b.type='button';b.addEventListener('click',deleteFn);td.append(b);tr.append(td);}parent.append(tr);
}
function showWithdrawals(){
 const body=$('wRows');body.replaceChildren();
 withdrawals.forEach((w,i)=>row([w.date,w.asset,w.amount,w.status,w.address,w.note],body,()=>{withdrawals.splice(i,1);showWithdrawals();}));
}
function showEvidence(){
 const body=$('fileRows');body.replaceChildren();
 evidence.forEach((f,i)=>row([String(i+1),f.name,f.size+' bytes',f.sha256],body,()=>{evidence.splice(i,1);showEvidence();}));
}
function casePacket(){
 const statuses=reconciliation?.summary||null;
 return {
  schema:'evidence-tracer-generic-evidence-report-v1',
  generatedAt:new Date().toISOString(),
  caseTitle:$('caseTitle').value.trim()||'無題の事案',
  submitter:$('reporter').value.trim(),
  account:{type:'SELF_REPORTED_UNVERIFIED',statement:$('caseStatement').value.trim()},
  withdrawalRecords:withdrawals.map(w=>({...w,source:'USER_TRANSCRIPTION_NOT_INDEPENDENTLY_VERIFIED'})),
  sourceFiles:evidence.map(f=>({...f})),
  reconciliation:statuses,
  dataProvenance:{caseStatement:'USER_DECLARED',withdrawals:'USER_TRANSCRIBED',files:'USER_SELECTED_SHA256',reconciliation:statuses?'IMPORTED_UNVERIFIED':'NOT_PROVIDED'},
  limitations:[
   '入力した送金申請の内容は利用者による転記であり、原本資料との照合が必要です。',
   '送金待の画面表示だけではブロックチェーン上の送金不存在を証明できません。',
   '照合JSONは本人が読み込んだ派生資料です。元取引、送金先、取得元と照合してください。',
   'SHA-256は選択されたファイルのバイト列を識別しますが、作成元・取得方法を証明しません。',
   '内部交換や融資の元本を外部入金として二重計上しないでください。',
   '原本ファイル、メール、ブロックチェーンの参照URLなどは別途保全して提出してください。'
  ]
 };
}
function renderReport(){
 const r=casePacket(),out=$('reportPreview');out.replaceChildren();
 out.append(el('h2','提出用資料：'+r.caseTitle),el('p','作成日時：'+new Date(r.generatedAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})+' JST'));
 out.append(el('h3','1．提出者・事案'));
 out.append(el('p','提出者：'+(r.submitter||'未記入')));
 out.append(el('p','本人による説明（未検証）：'+(r.account.statement||'未記入')));
 out.append(el('h3','2．申請記録（本人転記・原本確認要）'));
 if(!r.withdrawalRecords.length)out.append(el('p','申請記録なし'));
 else{
  const table=document.createElement('table'),head=document.createElement('thead'),thr=document.createElement('tr');
  ['日時','資産','数量','記載状態','受信アドレス','出典'].forEach(x=>thr.append(el('th',x)));head.append(thr);table.append(head);
  const body=document.createElement('tbody');r.withdrawalRecords.forEach(w=>row([w.date,w.asset,w.amount,w.status,w.address,w.note],body));table.append(body);
  const scroll=document.createElement('div');scroll.className='results';scroll.append(table);out.append(scroll);
 }
 out.append(el('h3','3．証拠原本目録'));
 if(!r.sourceFiles.length)out.append(el('p','原本未登録'));
 else{
  const table=document.createElement('table'),head=document.createElement('thead'),thr=document.createElement('tr');
  ['No.','ファイル名','サイズ','SHA-256'].forEach(x=>thr.append(el('th',x)));head.append(thr);table.append(head);
  const body=document.createElement('tbody');r.sourceFiles.forEach((f,i)=>row([String(i+1),f.name,f.size+' bytes',f.sha256],body));table.append(body);
  const scroll=document.createElement('div');scroll.className='results';scroll.append(table);out.append(scroll);
 }
 out.append(el('h3','4．取引照合の概要'));
 out.append(el('p',r.reconciliation?'読込JSONによる集計（未再検証）：'+JSON.stringify(r.reconciliation):'照合結果は未登録'));
 out.append(el('h3','5．確認上の限界'));
 const ul=document.createElement('ul');r.limitations.forEach(x=>ul.append(el('li',x)));out.append(ul);
 out.append(el('p','※ この資料は提出者による証拠整理であり、司法・捜査機関による鑑定結果ではありません。'));
 $('reportStatus').textContent='レポートを更新しました。出典の確認と原本との照合を行ってください。';
}
function save(name,contents){
 const blob=new Blob([contents],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
$('withdrawalForm').addEventListener('submit',e=>{
 e.preventDefault();
 const w={date:$('wDate').value.trim(),asset:$('wAsset').value.trim().toUpperCase(),amount:$('wAmount').value.trim(),status:$('wStatus').value.trim(),address:$('wAddress').value.trim(),note:$('wNote').value.trim()};
 if(!/^\d+(?:\.\d+)?$/.test(w.amount)){$('reportStatus').textContent='数量は整数または小数で入力してください。';return;}
 withdrawals.push(w);showWithdrawals();e.currentTarget.reset();
});
$('clearWithdrawals').addEventListener('click',()=>{withdrawals.length=0;showWithdrawals();});
$('evidenceFiles').addEventListener('change',async e=>{
 const input=e.currentTarget,files=Array.from(input.files||[]);input.disabled=true;
 try{
  for(const file of files){
   if(file.size>120*1024*1024)throw Error('120MB以上のファイルは一度に処理できません: '+file.name);
   const hash=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
   const sha256=Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,'0')).join('');
   if(!evidence.some(x=>x.sha256===sha256&&x.name===file.name))evidence.push({name:file.name,size:file.size,mimeType:file.type,sha256});
  }
  showEvidence();$('fileStatus').textContent=evidence.length+'件登録しました。原本ファイルはページに保持しません。';
 }catch(err){$('fileStatus').textContent='ハッシュ計算に失敗：'+err.message;}
 finally{input.value='';input.disabled=false;}
});
$('reconFile').addEventListener('change',async e=>{
 const file=e.currentTarget.files?.[0];if(!file)return;
 try{
  if(file.size>15*1024*1024)throw Error('照合JSONは15MB以下を選択してください。');
  const parsed=JSON.parse(await file.text());
  if(!parsed||!Array.isArray(parsed.records)||!parsed.records.every(x=>x&&typeof x==='object'&&typeof x.status==='string'))throw Error('Evidence Tracerの照合JSONを選択してください。');
  const counts={};for(const r of parsed.records)counts[r.status]=(counts[r.status]||0)+1;
  reconciliation={summary:{source:'IMPORTED_UNVERIFIED_RECONCILIATION',recordCount:parsed.records.length,statusCounts:counts},fileName:file.name};
  $('reconStatus').textContent=file.name+'：'+parsed.records.length+'件（読み込み結果は未再検証）';
 }catch(err){reconciliation=null;$('reconStatus').textContent='読み込み失敗：'+err.message;}
 finally{e.currentTarget.value='';}
});

const VALID_SCHEMA='evidence-tracer-generic-evidence-report-v1';
function validatePacket(p){
 if(!p||typeof p!=='object'||p.schema!==VALID_SCHEMA)throw Error('Evidence Tracerで出力した提出用JSONを選択してください。');
 if(!Array.isArray(p.withdrawalRecords)||!Array.isArray(p.sourceFiles)||p.withdrawalRecords.length>5000||p.sourceFiles.length>5000)throw Error('配列形式または件数が不正です。');
 if(p.withdrawalRecords.some(w=>!w||typeof w!=='object'||typeof w.date!=='string'||typeof w.asset!=='string'||typeof w.amount!=='string'||!/^\d+(?:\.\d+)?$/.test(w.amount)||typeof w.status!=='string'||!['string','undefined'].includes(typeof w.address)))throw Error('出金申請レコードの形式が不正です。');
 if(p.sourceFiles.some(f=>!f||typeof f.name!=='string'||typeof f.sha256!=='string'||!/^[0-9a-f]{64}$/i.test(f.sha256)||!Number.isSafeInteger(f.size)||f.size<0))throw Error('証拠ファイルの目録が不正です。');
 if(p.reconciliation!=null && (!p.reconciliation||typeof p.reconciliation!=='object'||!Number.isSafeInteger(p.reconciliation.recordCount)||!p.reconciliation.statusCounts||typeof p.reconciliation.statusCounts!=='object'))throw Error('照合結果の要約が不正です。');
 return p;
}
function restorePacket(packet){
 const p=validatePacket(packet);
 $('caseTitle').value=String(p.caseTitle||'').slice(0,500);
 $('reporter').value=String(p.submitter||'').slice(0,500);
 $('caseStatement').value=String(p.account?.statement||'').slice(0,25000);
 withdrawals.length=0;
 for(const w of p.withdrawalRecords)withdrawals.push({
  date:w.date.slice(0,100),asset:w.asset.slice(0,50),amount:w.amount.slice(0,100),
  status:w.status.slice(0,150),address:String(w.address||'').slice(0,500),note:String(w.note||'').slice(0,1000)
 });
 evidence.length=0;
 for(const f of p.sourceFiles)evidence.push({name:f.name.slice(0,500),size:f.size,mimeType:String(f.mimeType||'').slice(0,200),sha256:f.sha256.toLowerCase()});
 reconciliation=p.reconciliation?{summary:{source:'IMPORTED_UNVERIFIED_RECONCILIATION',recordCount:p.reconciliation.recordCount,statusCounts:{...p.reconciliation.statusCounts}},fileName:'Imported prior packet'}:null;
 importedRecord=true;
 showWithdrawals();showEvidence();
 $('fileStatus').textContent=evidence.length+'件の目録を復元しました。原本ファイルの中身は復元されません。';
 $('reconStatus').textContent=reconciliation?'以前の照合概要を復元しました（未再検証）。':'照合JSONは読み込まれていません。';
 renderReport();
 $('reportStatus').textContent='下書きを復元しました。原本ファイルのSHA-256を再確認してから提出してください。';
}
$('restorePacket').addEventListener('change',async e=>{
 const file=e.currentTarget.files?.[0];if(!file)return;
 try{
  if(file.size>8*1024*1024)throw Error('提出用JSONは8MB以下のファイルを選択してください。');
  restorePacket(JSON.parse(await file.text()));
 }catch(err){$('reportStatus').textContent='復元に失敗しました：'+err.message;}
 finally{e.currentTarget.value='';}
});
$('clearCase').addEventListener('click',()=>{
 if(!confirm('画面内の事件情報・出金記録・証拠目録をすべて消去しますか？'))return;
 withdrawals.length=0;evidence.length=0;reconciliation=null;importedRecord=false;
 ['caseTitle','reporter','caseStatement'].forEach(id=>$(id).value='');
 showWithdrawals();showEvidence();
 $('fileStatus').textContent='ファイルはまだ選択されていません。';
 $('reconStatus').textContent='照合JSONは読み込まれていません。';
 $('reportPreview').replaceChildren(el('h2','提出用レポートのプレビュー'),el('p','入力後、「レポートを作成」を選んでください。'));
 $('reportStatus').textContent='ページ内の事件情報を消去しました。既にダウンロードしたJSONファイルは削除されません。';
});

$('makeReport').addEventListener('click',renderReport);
$('printReport').addEventListener('click',()=>{renderReport();window.print();});
$('exportPacket').addEventListener('click',()=>{renderReport();save('EvidenceTracer-Police-Report-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(casePacket(),null,2));});
})();