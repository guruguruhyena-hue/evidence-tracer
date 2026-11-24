'use strict';
/* Historical daily estimated JPY valuations via publicly documented data providers.
 * No private transfer data or wallet address is transmitted to those providers.
 * Coin/USDT close × USD/JPY daily reference rate is an APPROXIMATION,
 * NOT an observed crypto/JPY execution price or an exact USDT/JPY cross.
 */
(function(root){
 const mapping=Object.freeze({BTC:'BTCUSDT',ETH:'ETHUSDT',SOL:'SOLUSDT',XRP:'XRPUSDT',SHIB:'SHIBUSDT',OP:'OPUSDT',USDC:'USDCUSDT'});
 function decimalProduct(left,right,maxDecimals=12){
  function p(v){const s=String(v);if(!/^\d+(?:\.\d+)?$/.test(s)||s.length>90)throw Error('Invalid decimal quote');const [a,b='']=s.split('.');return [BigInt(a+b),b.length];}
  const [a,as]=p(left),[b,bs]=p(right),n=a*b,scale=as+bs,target=BigInt(Math.max(0,scale-maxDecimals));
  let d=10n**target,v=(n+d/2n)/d;const places=scale-Number(target);
  if(!places)return v.toString();
  let str=v.toString().padStart(places+1,'0');
  return (str.slice(0,-places)+'.'+str.slice(-places).replace(/0+$/,'')).replace(/\.$/,'') || '0';
 }
 async function json(url,timeout=14000){
  let response;
  try{response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(timeout)});}
  catch(e){throw Error('通信失敗（CORS・ネットワーク・接続制限）：'+e.message);}
  if(!response.ok)throw Error('HTTP '+response.status+' '+url.split('/')[2]);
  try{return await response.json()}catch{throw Error('JSON応答を読めませんでした');}
 }
 async function binanceBars(asset,startDate,endDate,progress){
  const symbol=mapping[asset];if(!symbol)throw Error('この通貨の公開USDT市場を未設定');
  const start=Date.parse(startDate+'T00:00:00Z'),end=Date.parse(endDate+'T00:00:00Z')+86400000;
  const out=new Map();
  const providers=['https://data-api.binance.vision','https://api.binance.com'];
  let lastError;
  for(const provider of providers){
   try{
    for(let cursor=start;cursor<end;){
     const url=provider+'/api/v3/klines?symbol='+symbol+'&interval=1d&startTime='+cursor+'&endTime='+end+'&limit=1000';
     const data=await json(url);
     if(!Array.isArray(data))throw Error('Klines応答が配列ではありません');
     if(!data.length)break;
     for(const v of data){
      if(!Array.isArray(v)||!Number.isFinite(v[0])||!/^\d+(?:\.\d+)?$/.test(String(v[4])))continue;
      const day=new Date(v[0]).toISOString().slice(0,10);
      out.set(day,{close:String(v[4]),url,provider,symbol});
     }
     const next=data[data.length-1]?.[0]+86400000;
     if(!Number.isFinite(next)||next<=cursor)throw Error('日付カーソルが進みません');
     cursor=next;
     if(progress)progress(asset+' USDT建て日足 '+out.size+'件');
     if(data.length<1000)break;
    }
    if(out.size)return out;
    lastError=Error('この期間に取引データなし');
   }catch(e){lastError=e;out.clear();}
  }
  throw lastError||Error('市場データなし');
 }
 async function fxHistory(startDate,endDate){
  const previous=new Date(Date.parse(startDate+'T00:00:00Z')-10*86400000).toISOString().slice(0,10);
  const url='https://api.frankfurter.dev/v1/'+previous+'..'+endDate+'?base=USD&symbols=JPY';
  const data=await json(url);
  if(!data?.rates||typeof data.rates!=='object')throw Error('為替履歴が取得できません');
  const days=Object.keys(data.rates).sort();
  const out=new Map();
  for(const date of days){const price=data.rates[date]?.JPY;if(typeof price==='number'&&price>0)out.set(date,{rate:String(price),sourceDay:date,url});}
  if(!out.size)throw Error('USD/JPY為替が空です');
  return out;
 }
 function fxForDay(day,fx){
  let found=null;for(const [d,r] of fx){if(d<=day)found=r;else break;}return found;
 }
 async function obtain({assets,dates,onProgress}){
  const validDates=dates.filter(d=>/^\d{4}-\d\d-\d\d$/.test(d)).sort();
  if(!validDates.length)throw Error('有効な取引日がありません');
  const earliest=validDates[0],latest=validDates[validDates.length-1];
  onProgress?.('過去USD/JPYレート取得中…');
  const fx=await fxHistory(earliest,latest);
  const output=new Map(),errors=[];
  for(const asset of assets){
   if(!mapping[asset]&&asset!=='USDT'){errors.push(asset+':市場未対応');continue;}
   let bars=null;
   if(asset!=='USDT'){
    onProgress?.(asset+'の日足を取得中…');
    try{bars=await binanceBars(asset,earliest,latest,onProgress);}
    catch(e){errors.push(asset+':'+e.message);continue;}
   }
   let count=0;
   const needed=[...new Set(validDates)];
   for(const day of needed){
    const fxQuote=fxForDay(day,fx);
    const bar=asset==='USDT'?null:bars.get(day);
    if(!fxQuote|| (asset!=='USDT'&&!bar))continue;
    const price=decimalProduct(bar?.close||'1',fxQuote.rate);
    if(price==='0')continue;
    const urls=[bar?.url,fxQuote.url].filter(Boolean);
    output.set(asset+'|'+day,{
      price,source:asset==='USDT'?'USD/JPY reference; assumed 1 USDT = 1 USD (estimate)':
        'Binance '+mapping[asset]+' 1d UTC close × Frankfurter USD/JPY reference (estimate)',
      sourceUrl:urls.join(' ; '),
      sourceSha256:'',evidenceRef:asset+' '+day+'; FX day '+fxQuote.sourceDay,
      method:asset==='USDT'?'USDT_USD_PARITY_ASSUMPTION_X_USDJPY_REFERENCE':'USDT_PAIR_DAILY_CLOSE_X_USDJPY_REFERENCE',
      timestamp:new Date().toISOString()
    });count++;
   }
   if(!count)errors.push(asset+':対象日の価格なし');
   onProgress?.(asset+'：対象日 '+count+'件の概算円レート');
  }
  return {output,errors,fxDays:fx.size};
 }
 root.HistoricalPriceSources={obtain,decimalProduct,mapping};
})(globalThis);
