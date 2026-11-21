/* Police submission kit: local-only derivative report, not forensic certification. */
(() => {
'use strict';
const WITHDRAWALS=[
 {id:'WD-20260830-BTC',time:'2026-08-30 07:30',asset:'BTC',principal:'0.19195473',profit:'0.015777',requested:'0.20766173',address:'bc1qelp87pfrnxrc5ks7adxcq8h3ue3hupp34ne854'},
 {id:'WD-20260830-ETH',time:'2026-08-30 07:33',asset:'ETH',principal:'1',profit:'0.0821919',requested:'1.0806919',address:'0x8fEEe00f1d8C355086b4667f153C744688b7F6b0'},
 {id:'WD-20260830-SOL',time:'2026-08-30 07:34',asset:'SOL',principal:'4.02169864',profit:'0.3305505',requested:'4.34224914',address:'At26TxgbKA18eLsm3MX9d26pti3yQm6RM6mD58qM94Kz'},
 {id:'WD-20260830-XRP',time:'2026-08-30 07:41',asset:'XRP',principal:'461.356718',profit:'37.91973',requested:'499.076448',address:'rnp2Keixnwq28wDXbgjZcQwtKBYMB15KVf'}
];
let manifest=[];
let importedReconciliation=null;
const $=id=>document.getElementById(id);
const make=(tag,text,cls)=>{const el=document.createElement(tag);if(cls)el.className=cls;el.textContent=text??'';return el;};
const clean=(s)=>String(s??'');
function parseUnits(value){
 const m=/^(\d+)(?:\.(\d+))?$/.exec(clean(value));if(!m)throw Error('Invalid decimal: '+value);
 const d=m[2]||'';return {n:BigInt(m[1]+d),places:d.length};
}
function difference(a,b,c){
 const vals=[a,b,c].map(parseUnits),p=Math.max(...vals.map(x=>x.places));
 const ns=vals.map(x=>x.n*10n**BigInt(p-x.places));
 const v=ns[0]+ns[1]-ns[2],negative=v<0n,abs=negative?-v:v;
 let str=abs.toString().padStart(p+1,'0');
 if(p)str=str.slice(0,-p)+'.'+str.slice(-p).replace(/0+$/,'');
 return (negative?'-':'')+str.replace(/\.$/,'');
}
function escapeCsv(x){return '"'+clean(x).replace(/"/g,'""')+'"';}
function localReconciliation(){
 try{
   if(typeof reconciliationResults!=='undefined' && Array.isArray(reconciliationResults) && reconciliationResults.length){
     const counts={};for(const r of reconciliationResults)counts[r.status]=(counts[r.status]||0)+1;
     return {source:'current_browser_reconciliation',count:reconciliationResults.length,statusCounts:counts,records:reconciliationResults.map(r=>({id:r.recordId,asset:r.asset,amount:r.amount,txid:r.txid,status:r.status,reason:r.reason,sourcePage:r.sourcePage,sourceResolutionError:r.sourceResolutionError,baseResolutionError:r.baseResolutionError}))};
   }
 }catch{}
 return importedReconciliation;
}
function drawWithdrawalRows(){
 const tbody=$('policeWithdrawals');if(!tbody)return;tbody.replaceChildren();
 for(const w of WITHDRAWALS){
   const tr=document.createElement('tr');
   for(const val of [w.time,w.asset,w.principal,w.profit,w.requested,difference(w.principal,w.profit,w.requested),w.address,'送金待（2026/09/23保存の送金履歴に記載）']){
     const td=make('td',val);if(val===w.address)td.className='police-address';tr.append(td);
   }
   tbody.append(tr);
 }
}
function renderManifest(){
 const list=$('policeManifest');if(!list)return;list.replaceChildren();
 for(let i=0;i<manifest.length;i++){
   const e=manifest[i];const tr=document.createElement('tr');
   for(const v of [e.id,e.name,e.size+' bytes',e.sha256,e.recordedAt]){
     const td=make('td',v);if(v===e.sha256)td.className='police-address';tr.append(td);
   }
   const td=document.createElement('td'),button=make('button','除外');button.type='button';
   button.addEventListener('click',()=>{if(importedReconciliation?.sourceDocumentSha256===e.sha256)importedReconciliation=null;manifest.splice(i,1);renderManifest();});
   td.append(button);tr.append(td);list.append(tr);
 }
 $('policeManifestStatus').textContent=manifest.length+'件のファイルを記録しました。原本ファイルはアプリに保存されません。';
}
async function registerFiles(files){
 for(const file of files){
   const buf=await file.arrayBuffer();
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buf))).map(x=>x.toString(16).padStart(2,'0')).join('');
   if(manifest.some(x=>x.sha256===hash&&x.name===file.name))continue;
   manifest.push({id:'DOC-'+String(manifest.length+1).padStart(3,'0'),name:file.name,size:file.size,mime:file.type||'',sha256:hash,recordedAt:new Date().toISOString(),role:inferRole(file.name)});
   // Import previous exports as derivative evidence, not as verified raw chain data.
   if(/\.json$/i.test(file.name)){
     try{
       const j=JSON.parse(new TextDecoder().decode(buf));
       if(Array.isArray(j.records)&&j.records.every(r=>r&&typeof r==='object')&&
          j.records.some(r=>'status' in r)&&
          (j.source||j.methodology||j.generatedAt)){
         const counts={};
         for(const r of j.records)counts[clean(r.status||'UNSPECIFIED')]=(counts[clean(r.status||'UNSPECIFIED')]||0)+1;
         importedReconciliation={source:'imported_reconciliation_json_unverified',count:j.records.length,statusCounts:counts,sourceDocumentSha256:hash,records:j.records.map(r=>({
          id:r.recordId||null,asset:r.asset||null,amount:r.amount||null,txid:r.txid||null,
          status:r.status||null,reason:r.reason||null,sourcePage:r.sourcePage||null,
          sourceResolutionError:r.sourceResolutionError||null,baseResolutionError:r.baseResolutionError||null
         }))};
       }
     }catch{}
   }
 }
 renderManifest();
}
function inferRole(name){
 if(/入金/.test(name))return 'IZAKA-YA 入金履歴';
 if(/融資/.test(name))return 'IZAKA-YA 融資履歴';
 if(/交換/.test(name))return 'IZAKA-YA 内部交換履歴';
 if(/送金|出金/.test(name))return 'IZAKA-YA 送金・出金履歴';
 if(/reconcil/i.test(name))return 'Evidence Tracer 照合結果（派生資料）';
 return 'その他参考資料（内容未検証）';
}
function assemble(){
 const now=new Date().toISOString(),r=localReconciliation(),notes=$('policeUserStatement').value.trim();
 return {
  schema:'evidence-tracer-police-packet-v1',generatedAt:now,timezone:'Asia/Tokyo',
  reportTitle:'IZAKA-YA 出金申請・未着金に関する整理資料',
  scope:'提出者提供資料の整理。警察・第三者による鑑定や入金不存在証明ではない。',
  statement:{type:'USER_STATEMENT_UNVERIFIED',text:notes||'（提出者による補足説明は未記入）'},
  withdrawals:{
   sourceDescription:'IZAKA-YA送金履歴PDF（2026/09/23 12:59 保存表示）と融資履歴PDF（同日13:00 保存表示）に記載された数字。原本照合要。',
   entries:WITHDRAWALS.map(w=>({...w,computedDifference:difference(w.principal,w.profit,w.requested),status:'PENDING_AS_SHOWN_IN_SAVED_PDF',statusAsOf:'2026-09-23',onchainDisbursementVerified:false,externalReceiptChecked:false}))
  },
  sources:manifest.map(x=>({...x})),
  reconciliation:r,
  limitations:[
   '未着金の主張は提出者の申告であり、本レポートはブロックチェーン上の不送金を自動的に証明しない。',
   '送金待は2026/09/23に保存されたIZAKA-YAのPDF画面に表示された状態を表す。現在の状態ではない。',
   '差額は融資終了元本と表示利益の和から出金申請額を引いた算術値であり、手数料と確定したものではない。',
   '内部交換・融資の元本再投入・表示利益を外部新規入金として重複加算しない。',
   'SimpleSwap / ChangeNOWの交換関連性は出金TXと注文履歴が照合できるまで確定しない。',
   '以前の照合JSONを読み込んだ場合、その内容は再検証済みではなく、読み込み済みの派生証拠として扱う。',
   'SHA-256は利用者が選択したバイト列の識別値。取得元の真正性を単独で証明するものではない。',
   '証拠原本（PDF・メール・スクリーンショット・TxID）は必ず別に保管して提出する。'
  ]
 };
}
function renderPreview(){
 const packet=assemble(),host=$('policePreview');
 host.replaceChildren();
 host.append(make('h2','IZAKA-YA 出金申請・未着金に関する整理資料'));
 host.append(make('p','作成日時：'+new Date(packet.generatedAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})+' JST','police-print-meta'));
 host.append(make('h3','1．資料の性質'));
 host.append(make('p','IZAKA-YAが提供したとされる履歴PDFと提出者の説明を整理した資料です。捜査上の事実認定や鑑定結果ではありません。'));
 host.append(make('h3','2．出金申請4件（2026年8月30日）'));
 const table=document.createElement('table'),thead=document.createElement('thead'),tr=document.createElement('tr');
 for(const label of ['日時 JST','資産','元本','利益（表示）','申請額','差額（計算）','申請先','PDFの状態'])tr.append(make('th',label));
 thead.append(tr);table.append(thead);const tbody=$('policeWithdrawals').cloneNode(true);tbody.removeAttribute('id');table.append(tbody);
 const frame=make('div','','results');frame.append(table);host.append(frame);
 host.append(make('p','※ 数値は各資産の単位です。差額の法的・会計的な性質は未確定です。'));
 host.append(make('h3','3．提出者の説明（本人申告・未検証）'));
 host.append(make('p',packet.statement.text));
 host.append(make('h3','4．証拠目録・SHA-256'));
 if(!manifest.length)host.append(make('p','証拠ファイル未登録：原本を選択しハッシュを取得してください。'));
 else{
  const t=document.createElement('table');const head=document.createElement('tr');
  for(const label of ['番号','資料名','分類','SHA-256'])head.append(make('th',label));
  const th=document.createElement('thead');th.append(head);t.append(th);const tb=document.createElement('tbody');
  for(const e of manifest){const line=document.createElement('tr');for(const v of [e.id,e.name,e.role,e.sha256])line.append(make('td',v));tb.append(line);}t.append(tb);
  const box=make('div','','results');box.append(t);host.append(box);
 }
 host.append(make('h3','5．Evidence Tracer照合状況'));
 if(packet.reconciliation){
  const entries=Object.entries(packet.reconciliation.statusCounts).map(([k,v])=>k+': '+v).join(' / ');
  host.append(make('p',packet.reconciliation.count+'件：'+entries+'。出典：'+(packet.reconciliation.source==='current_browser_reconciliation'?'ブラウザ内の最新照合':'読み込み済み照合JSON（未再検証）')+'。'));
 }else host.append(make('p','未読み込み：照合JSONは生成されていません。Trace結果を照合してから本レポートを作り直してください。'));
 host.append(make('h3','6．調査上の留意事項'));
 const ul=document.createElement('ul');for(const t of packet.limitations)ul.append(make('li',t));host.append(ul);
 host.append(make('p','添付原本のファイル名・SHA-256を照合のうえ、内容については原本とチェーンエクスプローラー等で独立検証してください。','police-print-meta'));
}
function downloadFile(name,text,type){
 const blob=new Blob([text],{type});const url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
}
function start(){
 if(!$('policeEvidenceFiles'))return;
 drawWithdrawalRows();renderManifest();
 $('policeEvidenceFiles').addEventListener('change',async e=>{
  const input=e.currentTarget;input.disabled=true;
  try{
   $('policeManifestStatus').textContent='ファイルのSHA-256を計算しています…';
   await registerFiles(Array.from(input.files||[]));
  }catch(error){$('policeManifestStatus').textContent='SHA-256計算エラー：'+error.message;}
  finally{input.value='';input.disabled=false;}
 });
 $('policePreviewButton').addEventListener('click',()=>{renderPreview();$('policePreview').scrollIntoView({behavior:'smooth',block:'start'});});
 $('policeJsonExport').addEventListener('click',()=>{
  downloadFile('EvidenceTracer-Police-Packet-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(assemble(),null,2),'application/json');
 });
 $('policePrint').addEventListener('click',()=>{renderPreview();document.body.classList.add('police-print-mode');window.print();});
 window.addEventListener('afterprint',()=>document.body.classList.remove('police-print-mode'));
 $('policeCsvExport').addEventListener('click',()=>{
  const rows=[['ID','Date JST','Asset','Principal','Displayed Profit','Withdrawal Request','Computed Difference','Destination','PDF Status'],...WITHDRAWALS.map(w=>[w.id,w.time,w.asset,w.principal,w.profit,w.requested,difference(w.principal,w.profit,w.requested),w.address,'PENDING_AS_OF_2026-09-23'])];
  downloadFile('EvidenceTracer-Withdrawals-2026-08-30.csv',rows.map(r=>r.map(escapeCsv).join(',')).join('\r\n'),'text/csv;charset=utf-8');
 });
}
window.addEventListener('DOMContentLoaded',start);
})();