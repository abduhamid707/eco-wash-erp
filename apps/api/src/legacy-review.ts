// Read-only conversion of ECO WASH's four legacy workbooks to a review workbook.
// No database writes are performed. Uncertain values require owner sign-off.
import ExcelJS from 'exceljs';
import { existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';

const args=process.argv.slice(2);
if(args.length<4){console.error('Usage: pnpm --filter @eco/api legacy:review <ECO_WASH_HISOBOT.xlsx> <Hisob_k.xlsx> <Viloyatlar_qarzi.xlsx> <Rasxod.xlsx> [output.xlsx]');process.exit(2);}
for(const file of args.slice(0,4))if(!existsSync(file))throw new Error('File not found: '+file);
const input=args.slice(0,4).map(resolve);
const output=resolve(args[4]||join(dirname(input[0]),'eco-wash-legacy-review.xlsx'));
const toText=(value:unknown):string=>{
 if(value==null)return '';
 if(typeof value==='object'&&'result' in value)return toText((value as {result:unknown}).result);
 if(typeof value==='object'&&'text' in value)return toText((value as {text:unknown}).text);
 if(value instanceof Date)return value.toISOString().slice(0,10);
 return String(value).trim();
};
const value=(ws:ExcelJS.Worksheet,row:number,col:number)=>toText(ws.getRow(row).getCell(col).value);
const number=(v:string)=>{const normalized=v.replace(/\s/g,'').replace(',','.');if(!normalized)return null;const n=Number(normalized);return Number.isFinite(n)?n:null;};
const date=(v:string)=>{const n=number(v);if(n&&n>30000&&n<90000){return new Date(Math.round((n-25569)*86400000)).toISOString().slice(0,10);}return v;};
const safe=(text:string)=>text.toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,48)||'UNKNOWN';
const isTotal=(n:string)=>/^(jami|itogo|total|summa|остаток|qoldiq)/i.test(n.trim());
const load=async(path:string)=>{const wb=new ExcelJS.Workbook();await wb.xlsx.readFile(path);return wb;};
const [report,recipes,regions,expenses]=await Promise.all(input.map(load));
const review=new ExcelJS.Workbook();review.creator='ECO WASH ERP conversion review';
const put=(name:string,headers:string[],rows:Array<Array<string|number>>)=>{
 const sh=review.addWorksheet(name);sh.addRow(headers);rows.forEach(row=>sh.addRow(row));
 sh.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};
 sh.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF0A2937'}};
 sh.views=[{state:'frozen',ySplit:1}];
 sh.columns=headers.map(h=>({width:Math.max(16,Math.min(42,h.length+9))}));
 return sh;
};
type StockRow={source:string;date:string;name:string;quantity:string;unitPrice:string;total:string};
const stockRows=(sheet:ExcelJS.Worksheet,headerRow:number,dateRow:number,nameHeader:string)=>{
 const blocks:Array<{start:number;date:string;lines:StockRow[]}>=[],header=nameHeader.toLowerCase();
 for(let col=1;col<sheet.columnCount;col++){
  const h=value(sheet,headerRow,col).toLowerCase();
  if(!h.includes(header))continue;
  const lines:StockRow[]=[];
  for(let row=headerRow+1;row<=sheet.rowCount;row++){
   const name=value(sheet,row,col);if(!name||isTotal(name))continue;
   const quantity=value(sheet,row,col+1),unitPrice=value(sheet,row,col+2),total=value(sheet,row,col+3);
   if(number(quantity)===null)continue;
   lines.push({source:sheet.name,date:date(value(sheet,dateRow,col)),name,quantity,unitPrice,total});
  }
  blocks.push({start:col,date:date(value(sheet,dateRow,col)),lines});
 }
 const latest=blocks.sort((a,b)=>a.start-b.start).at(-1);
 return {latest:latest?.lines||[],all:blocks.flatMap(x=>x.lines),blocks:blocks.length};
};
const rawSheet=report.getWorksheet('Sklad homashyo');
const finalSheet=report.getWorksheet('Sklad tayyor M');
if(!rawSheet||!finalSheet)throw new Error('Legacy report missing expected stock sheets');
const raw=stockRows(rawSheet,3,2,'nomi');
const finished=stockRows(finalSheet,4,3,'mahsulot nomi');
const mapping=(xs:StockRow[])=>xs.map(x=>[x.date,x.name,x.quantity,x.unitPrice,x.total,'TASDIQ KERAK']);
put('Xomashyo oxirgi qoldiq',['Sana','Nomi','Miqdor','Birlik narx','Jami','Holat'],mapping(raw.latest));
put('Mahsulot oxirgi qoldiq',['Sana','Nomi','Miqdor','Birlik narx','Jami','Holat'],mapping(finished.latest));
put('Xomashyo tarixi',['Sana','Nomi','Miqdor','Birlik narx','Jami','Holat'],mapping(raw.all));
put('Mahsulot tarixi',['Sana','Nomi','Miqdor','Birlik narx','Jami','Holat'],mapping(finished.all));
const staffSheet=report.getWorksheet('Komanda avans');
const staff:Array<Array<string|number>>=[];
if(staffSheet)for(let r=2;r<=staffSheet.rowCount;r++){
 const name=value(staffSheet,r,2);if(!name||isTotal(name))continue;
 staff.push([name,value(staffSheet,r,3),value(staffSheet,r,4),value(staffSheet,r,5),value(staffSheet,r,6),'Kunlik hisob va oylik qoidasi moslashtirilsin']);
}
put('Ishchilar tekshirish',['Ism','Kunlik haq','Ishlagan kuni','Avans','Chiqqan oylik','Izoh'],staff);
const debtSheet=report.getWorksheet('Astatka diller');
const dealer:Array<Array<string|number>>=[];
if(debtSheet)for(let c=2;c<=debtSheet.columnCount;c++){
 if(!value(debtSheet,4,c).toLowerCase().includes('diller'))continue;
 for(let r=5;r<=debtSheet.rowCount;r++){const name=value(debtSheet,r,c);if(!name||isTotal(name))continue;
 const debt=value(debtSheet,r,c+1),our=value(debtSheet,r,c+2),d=value(debtSheet,r,c+3);
 if(!debt&&!our)continue;
 dealer.push([name,debt,our,date(d),'Takror va eski davrlar solishtirilsin']);
 }
}
put('Diler qarzi nomzod',['Viloyat dileri','Uning qarzi','Bizning qarz','Sana','Tekshiruv'],dealer);
const spend=expenses.worksheets[0],spends:Array<Array<string|number>>=[];
for(let r=1;r<=spend.rowCount;r++)for(const c of [2,8]){
 const title=value(spend,r,c),amount=value(spend,r,c+1);
 if(!title||!amount||number(amount)===null||isTotal(title))continue;
 spends.push([title,amount,'Sana va valyuta tekshirilsin']);
}
put('Xarajat nomzod',['Xarajat','Summa','Izoh'],spends);
const regionSheet=regions.worksheets[0],regionRows:Array<Array<string|number>>=[];
for(let c=2;c<=regionSheet.columnCount;c++){
 const region=value(regionSheet,2,c);
 if(!region||number(region)!==null||region.toLowerCase().includes('jami'))continue;
 if(!value(regionSheet,3,c+1).toLowerCase().includes('qop'))continue;
 for(let r=4;r<=regionSheet.rowCount;r++){
  const product=value(regionSheet,r,c),qty=value(regionSheet,r,c+1),price=value(regionSheet,r,c+2),total=value(regionSheet,r,c+3);
  if(!product||isTotal(product)||number(qty)===null)continue;
  regionRows.push([region,date(value(regionSheet,3,c)),product,qty,price,total,'To‘lov va qaytarishlarsiz qarz sifatida avtomatik import QILINMAYDI']);
 }
}
put('Viloyat yuklari',['Viloyat','Sana','Mahsulot','Qop','Narx','Jami','Ogohlantirish'],regionRows);
const recipeSheet=recipes.worksheets[0];
put('Retsept manbasi',['Manba','Izoh','Holat'],[['Hisob k.xlsx',recipeSheet.name,'Foizlar, sarf va mahsulot koeffitsiyentlari qo‘lda tasdiqlansin']]);
const candidates:Array<Array<string|number>>=[];
const unique=new Set<string>();
for(const [records,isRaw] of [[raw.latest,true],[finished.latest,false]] as const)for(const x of records){
 const key=x.name.toLocaleLowerCase('uz');if(unique.has(key))continue;unique.add(key);
 candidates.push(['PRODUCT',safe(x.name),x.name,'','', '',isRaw?'true':'false']);
}
put('Import shablon',['kind','code','name','region','unit','value','isRaw'],candidates);
put('Tasdiqlash kerak',['Bo‘lim','Muammo','Qaror'],[
 ['Xomashyo','Barcha kunlik bloklardan oxirgisini olamizmi?','Rahbar tasdiqlasin'],
 ['Tayyor mahsulot','Sklad qoldiqlari sanasi va birliklari','Rahbar tasdiqlasin'],
 ['Dilerlar','Bir viloyatdagi tarixiy takror yozuvlar','Qarzni bir marta tasdiqlang'],
 ['Xarajatlar','Aralash UZS va USD; xarajat sanasi yo‘q','Valyuta va vaqtni belgilang'],
 ['Xodimlar','Kunlik ish haqi va oy davomida berilgan avanslar','Oylik siyosatini tasdiqlang'],
 ['Retseptlar','Hisob k faylida foiz va o‘lchov farqlari','Har mahsulot retseptini tasdiqlang'],
 ['Baza','Bu fayl faqat review, bazaga hech narsa yozmaydi','Tasdiqlangandan so‘ng import shabloniga o‘tkazing']
]);
await review.xlsx.writeFile(output);
console.log(JSON.stringify({output,rawSnapshots:raw.blocks,finishedSnapshots:finished.blocks,rawCandidates:raw.latest.length,finishedCandidates:finished.latest.length,dealers:dealer.length,shipmentRows:regionRows.length,staff:staff.length,expenses:spends.length},null,2));
