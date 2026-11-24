'use strict';
/**
 * Independent, offline-only verifier for a CSV that was exported by valuation.js.
 * Verification uses integer division with quotient and remainder and is deliberately
 * separate from valuation.js's centsOf implementation.
 */
(function(root){
 const MAX_DIGITS=96;
 function parseDecimal(input){
   const text=String(input??'').trim();
   if(!/^(?:0|[0-9]+)(?:\.[0-9]+)?$/.test(text)||text.length>MAX_DIGITS)throw Error('invalid_decimal');
   const halves=text.split('.'),frac=halves[1]||'';
   return {unscaled:BigInt(halves[0]+frac),scale:frac.length};
 }
 function independentlyRoundedCents(amount,price){
   const a=parseDecimal(amount),b=parseDecimal(price);
   const numerator=a.unscaled*b.unscaled*100n;
   const denominator=10n**BigInt(a.scale+b.scale);
   const whole=numerator/denominator, remainder=numerator%denominator;
   return whole+(2n*remainder>=denominator?1n:0n);
 }
 function decimalCents(cents){
   const sign=cents<0n?'-':'',n=cents<0n?-cents:cents;
   return sign+(n/100n).toString()+'.'+(n%100n).toString().padStart(2,'0');
 }
 function hasSource(row){
   return typeof row.price_source==='string'&&row.price_source.trim().length>0&&
     (row.price_source_url||row.price_source_sha256||row.price_evidence_ref||'').trim().length>0;
 }
 function compareRow(row){
   const included=String(row.include_in_valuation||'').toLowerCase()==='yes';
   if(!included)return {status:'EXCLUDED',reason:'Not included in valuation'};
   if(!row.price_jpy)return {status:'MISSING_PRICE',reason:'No historical quote'};
   if(!row.amount)return {status:'INVALID_ROW',reason:'Missing amount'};
   try{
     const amount=parseDecimal(row.amount),price=parseDecimal(row.price_jpy);
     if(!amount.unscaled||!price.unscaled)return {status:'INVALID_ROW',reason:'Zero quantity or price'};
     const independent=decimalCents(independentlyRoundedCents(row.amount,row.price_jpy));
     if(row.estimated_value_jpy!==independent)
       return {status:'MISMATCH',reason:'Independent recalculation differs',independent};
     if(!hasSource(row))return {status:'SOURCE_UNDOCUMENTED',reason:'No evidence URL, SHA-256 or source reference',independent};
     return {status:'MATCH',reason:'Independent decimal recalculation matches; source reference present',independent};
   }catch(err){return {status:'INVALID_ROW',reason:String(err.message||err)};}
 }
 const COLS=['id','datetime_jst','price_date_utc','asset','amount','include_in_valuation','price_jpy',
 'estimated_value_jpy','price_source','price_source_url','price_source_sha256','price_evidence_ref',
 'price_method','price_checked_at_utc','txid','address','category','notes','original_source'];
 const POLICY={
  method:'DECIMAL_STRING_MULTIPLICATION',
  valuation:'quantity * unit price JPY',
  rounding:'ROUND_HALF_UP_PER_TRANSACTION_TO_0.01_JPY',
  aggregation:'SUM_OF_ALREADY_ROUNDED_TRANSACTION_CENTS',
  date:'Input datetime_jst interpreted as Asia/Tokyo; converted to corresponding UTC date; historical quote is UTC daily closing price, not exact deposit timestamp.',
  category:'Included rows are only candidate valuation rows. Evidence of deposit, acquisition cost, service return and legally established damages must be assessed separately.',
  verification:'Independent quotient/remainder BigInt verification of CSV data. MATCH is arithmetic and citation-field presence only, NOT external verification that a price source or transaction is genuine.',
  privacy:'Report stays in user browser and downloads locally; never upload personal evidence to public repository.'
 };
 root.ValuationAudit={parseDecimal,independentlyRoundedCents,decimalCents,compareRow,COLS,POLICY};
})(globalThis);
