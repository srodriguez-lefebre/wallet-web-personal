export function localDateInput(value:Date|string=new Date()):string{
  if(typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value))return value;
  const date=new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}
export function dateInputToIso(value:string):string{
  const [year,month,day]=value.split("-").map(Number);
  const date=new Date(year,month-1,day,12,0,0,0);
  if(localDateInput(date)!==value)throw new Error("Invalid calendar date");
  return date.toISOString();
}
