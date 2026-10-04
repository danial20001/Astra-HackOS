import { getDocumentProxy } from 'unpdf';
import dailySeed from './ucda-daily-seed.mjs';
const BASE='https://ugandacoffee.go.ug';
const MONTHS={january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12};
let recent=null;
export function reportURL(html,label){
 const escaped=label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const match=html.match(new RegExp('<a\\s+[^>]*href=["\\\']([^"\\\']+)["\\\'][^>]*>\\s*'+escaped+'\\s*</a>','i'));
 if(!match)throw Error('UCDA’s latest report link was not found.');const url=new URL(match[1].replaceAll('&amp;','&'),BASE);
 if(url.origin!==BASE||!url.pathname.startsWith('/sites/default/files/')||!url.pathname.toLowerCase().endsWith('.pdf'))throw Error('Unexpected UCDA report source.');return url.href;
}
function number(s){return Number(s.replace(/[^0-9.]/g,''));}
function flat(s){return s.replace(/\s+/g,' ').replace(/(\d)\s*,\s*(?=\d)/g,'$1,').trim();}
function validDate(year,month,day){const date=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;const d=new Date(date+'T00:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==date||d.getTime()>Date.now()+86400000)throw Error('Invalid UCDA report date.');return date;}
export function parseDaily(text,url,bytes){
 const s=flat(text);const date=s.slice(0,400).match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\s*(?:st|nd|rd|th)?\s+(20\s*\d\s*\d)/i);
 if(!date)throw Error('Could not verify the daily report date.');const reportDate=validDate(date[3].replace(/\s/g,''),MONTHS[date[1].toLowerCase()],Number(date[2]));
 const start=s.search(/WEEK\s*['’]?S\s*FARM\s*[-–]?\s*GATE\s*PRICE\s*RANGE\s*IN\s*UGX\s*\/\s*KILO/i);
 if(start<0)throw Error('No weekly farm-gate table was found.');const category=s.search(/Category\s+of\s+coffee/i);if(category<0)throw Error('No farm-gate categories were found.');const block=s.slice(category,category+850).split(/For more information/i)[0];
 if(!/FAQ.*Kiboko.*Arabica\s+Parchment.*Drugar/i.test(block))throw Error('The farm-gate table layout has changed.');
 const ranges=[...block.matchAll(/(\d[\d,]*)\s*(?:\/=)?\s*[-–]\s*(\d[\d,]*)\s*(?:\/=)?/g)];if(ranges.length!==4)throw Error('The farm-gate price columns are ambiguous.');
 const [low,high]=[number(ranges[2][1]),number(ranges[2][2])];if(!(1000<=low&&low<=high&&high<=50000))throw Error('The parchment prices failed validation.');
 return {id:reportDate,reportDate,coffeeType:'Arabica parchment',country:'Uganda',currency:'UGX',unit:'kg',basis:'weekly_farm_gate_range',low,high,sourceURL:url,sourcePDFBytes:bytes};
}
export function parseMonthly(text,url,bytes){
 const s=flat(text),m=s.match(/MONTHLY\s*(?:COFFEE\s*)?REPORT\s*[-–:]?\s*([A-Za-z]+)\s*,?\s*(20\s*\d\s*\d)/i);
 if(!m||!MONTHS[m[1].toLowerCase()])throw Error('Could not verify the monthly report period.');const period=`${m[2].replace(/\s/g,'')}-${String(MONTHS[m[1].toLowerCase()]).padStart(2,'0')}`;validDate(m[2].replace(/\s/g,''),MONTHS[m[1].toLowerCase()],1);
 const gate=s.search(/farm\s*[-–]?\s*gate/i);if(gate<0)throw Error('Monthly farm-gate figures were not found.');const block=s.slice(gate,gate+650),price=block.match(/Arabica\s+parchment\s*(?:averaged\s*)?(?:UGX|Ushs?\.?|Shs?\.?)?\s*([\d,\s]+?)\s*(?:\/=)?\s*(?:per\s*)?(?:kilo|kg)/i);
 if(!price)throw Error('Could not verify the monthly parchment average.');const average=number(price[1]);if(!(1000<=average&&average<=50000))throw Error('The monthly price failed validation.');return {period,price:average,source_url:url,sourcePDFBytes:bytes};
}
async function boundedFetch(url,limit,type){
 const r=await fetch(url,{signal:AbortSignal.timeout(25000),redirect:'manual',headers:{Accept:type},cf:{cacheTtl:300}});if(r.status>=300&&r.status<400)throw Error('UCDA redirected its report source. Try again later.');if(!r.ok){const error=Error('UCDA is unavailable right now.');error.status=r.status;throw error;}if(Number(r.headers.get('content-length'))>limit)throw Error('The UCDA response is larger than expected.');
 const reader=r.body.getReader();let size=0,chunks=[];while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw Error('The UCDA response is larger than expected.');}chunks.push(value);}const data=new Uint8Array(size);let pos=0;for(const c of chunks){data.set(c,pos);pos+=c.length;}return data;
}
async function pdfText(url){const data=await boundedFetch(url,8*1024*1024,'application/pdf');if(new TextDecoder().decode(data.slice(0,5))!=='%PDF-')throw Error('UCDA did not return a PDF report.');const sourceBytes=data.length;const doc=await getDocumentProxy(data,{disableFontFace:true,useSystemFonts:false});try{if(doc.numPages>20)throw Error('Unexpected report length.');const page=await doc.getPage(1),items=await page.getTextContent();return {text:items.items.map(i=>i.str||'').join(' '),bytes:sourceBytes};}finally{await doc.cleanup?.();}}
export async function latestReports(){
 if(recent&&Date.now()-recent.time<300000)return recent.result;
 const html=new TextDecoder().decode(await boundedFetch(BASE+'/',6*1024*1024,'text/html'));
 const dailyURL=reportURL(html,'Daily Coffee Market Analysis Report'),monthlyURL=reportURL(html,'Monthly Coffee Market Analysis Report');
 const [daily,archiveBytes]=await Promise.all([pdfText(dailyURL),boundedFetch(BASE+'/resource-center/reports/monthly-reports',6*1024*1024,'text/html')]);
 const archive=new TextDecoder().decode(archiveBytes),urls=[monthlyURL];
 for(const match of archive.matchAll(/href=["']([^"']+\.pdf[^"']*)["']/gi)){const url=new URL(match[1].replaceAll('&amp;','&'),BASE);if(url.origin===BASE&&url.pathname.startsWith('/sites/default/files/')&&!urls.includes(url.href))urls.push(url.href);if(urls.length===4)break;}
 const monthly=[];for(const url of urls){const pdf=await pdfText(url);monthly.push(parseMonthly(pdf.text,url,pdf.bytes));}
 if(new Set(monthly.map(r=>r.period)).size!==monthly.length)throw Error('Duplicate monthly report editions need review.');
 monthly.sort((a,b)=>a.period.localeCompare(b.period));
 const current=parseDaily(daily.text,dailyURL,daily.bytes),end=Date.parse(current.reportDate+'T00:00:00Z'),history=new Map(dailySeed.filter(r=>Date.parse(r.reportDate+'T00:00:00Z')>=end-29*86400000).map(r=>[r.reportDate,r]));
 for(const offset of [7,14,21,28]){const date=new Date(end-offset*86400000),key=date.toISOString().slice(0,10);if(history.has(key)||key<=dailySeed.at(-1).reportDate)continue;const day=date.getUTCDate(),suffix=day%100>=11&&day%100<=13?'th':({1:'st',2:'nd',3:'rd'}[day%10]||'th'),month=date.toLocaleString('en-US',{month:'long',timeZone:'UTC'}),url=BASE+'/sites/default/files/'+key.slice(0,7)+'/'+encodeURIComponent(`Daily Coffee Market Report (${month} ${String(day).padStart(2,'0')}${suffix} ${date.getUTCFullYear()}).pdf`);try{const pdf=await pdfText(url),record=parseDaily(pdf.text,url,pdf.bytes);if(record.reportDate!==key)throw Error('Report date mismatch.');history.set(key,record);}catch(error){if(error.status!==404)throw error;}}
 history.set(current.reportDate,current);const result={schemaVersion:1,checkedAt:new Date().toISOString(),daily:current,dailyHistory:[...history.values()].sort((a,b)=>a.reportDate.localeCompare(b.reportDate)),monthly};
 recent={time:Date.now(),result};return result;
}
