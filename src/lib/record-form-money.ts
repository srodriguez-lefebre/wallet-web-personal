import type { CurrencyCode } from "../../shared/types";

/** Hidden same-currency fields follow the edited amount; unchanged history keeps its bank amount. */
export function recordAccountAmount(amount:number,currency:CurrencyCode,accountCurrency:CurrencyCode,input:string,rate:number|null,preserveOriginal=false) {
  if(currency===accountCurrency&&!preserveOriginal) return amount;
  const explicit=Number(input);
  if(Number.isFinite(explicit)&&explicit>0) return explicit;
  return rate===null?null:Math.round(amount*rate*100)/100;
}

/** Retain the recorded conversion when the nominal amount changes. */
export function scaleConvertedAmount(input:string,previous:string,next:string) {
  const oldAmount=Number(previous),newAmount=Number(next),converted=Number(input);
  if(!input||oldAmount<=0||newAmount<=0||converted<=0) return "";
  return String(Math.round(converted*newAmount/oldAmount*100)/100);
}
