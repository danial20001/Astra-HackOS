'use strict';
let ucdaState=null,reportBusy=false;
const reportDateLabel=date=>new Date(date+'T00:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
function validateReportPayload(p){
 if(p?.schemaVersion!==1||!Array.isArray(p.monthly)||!p.monthly.length||p.monthly.length>4||!Number.isFinite(Date.parse(p.checkedAt)))throw Error('The downloaded report could not be verified.');
 const d=p.daily,date=new Date(d?.reportDate+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(d?.reportDate)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==d.reportDate||date.getTime()>Date.now()+86400000||d.country!=='Uganda'||d.coffeeType!=='Arabica parchment'||d.currency!=='UGX'||d.unit!=='kg'||d.basis!=='weekly_farm_gate_range'||!(Number.isFinite(d.low)&&Number.isFinite(d.high)&&d.low>=1000&&d.high>=d.low&&d.high<=50000))throw Error('The downloaded farm-gate prices could not be verified.');
 const source=url=>{const u=new URL(url);if(u.origin!=='https://ugandacoffee.go.ug'||!u.pathname.startsWith('/sites/default/files/')||!u.pathname.endsWith('.pdf'))throw Error('Unexpected report source.');};source(d.sourceURL);
 const months=new Set();for(const m of p.monthly){NoorPrice.monthIndex(m.period);if(months.has(m.period)||!Number.isFinite(m.price)||m.price<1000||m.price>50000||NoorPrice.monthIndex(m.period)>new Date().getFullYear()*12+new Date().getMonth())throw Error('The monthly history could not be verified.');months.add(m.period);source(m.source_url);}return p;
}
function renderUCDA(){
 const host=$('#ucdaLatestReport');host.replaceChildren();if(!ucdaState?.reports?.length){host.append(element('p','No report saved. Connect and update UCDA reports.'));return;}
 const r=ucdaState.reports[0];host.append(element('span','Latest UCDA price','report-heading'),element('h3',`UGX ${money(r.low)}–${money(r.high)} / kg`),element('p','Arabica parchment'));
 const source=element('a','UCDA · '+reportDateLabel(r.reportDate));source.href=r.sourceURL;source.target='_blank';source.rel='noopener noreferrer';host.append(source);
 const previous=ucdaState.reports.find(p=>p.reportDate<r.reportDate);if(previous){const now=(r.low+r.high)/2,before=(previous.low+previous.high)/2,change=(now/before-1)*100;host.append(element('p',Math.abs(change)<.05?'The range midpoint is unchanged since your previous saved report.':`${Math.abs(change).toFixed(1)}% ${change<0?'lower':'higher'} midpoint than your saved report from ${reportDateLabel(previous.reportDate)}.`,'report-change'));}
 const bytes=new Blob([JSON.stringify(ucdaState)]).size;const details=element('details',undefined,'report-metadata');details.append(element('summary','Report details'),element('p',`${ucdaState.reports.length} reports · ${(bytes/1024).toFixed(1)} KB`));host.append(details);
}
window.getMarketWeather=()=>ucdaState?.weather||null;
window.getUCDATrend=()=>ucdaState?.reports||[];
window.getUCDAReport=()=>ucdaState?.reports?.[0]||null;
async function saveReportUpdate(payload){
 const p=validateReportPayload(payload);if(p.weather)NoorMarket.validateWeather(p.weather);if(p.dailyHistory){if(!Array.isArray(p.dailyHistory)||p.dailyHistory.length>32)throw Error('Unexpected report history.');for(const r of p.dailyHistory)validateReportPayload({...p,daily:r,dailyHistory:undefined});}if(ucdaState?.reports?.[0]?.reportDate>p.daily.reportDate)throw Error('UCDA returned an older report. Your newer saved report was kept.');
 if(!priceModel||!priceHistory)throw Error('Load the price model before updating reports.');
 const merged=new Map(priceHistory.map(r=>[r.period,r]));for(const r of p.monthly)merged.set(r.period,{period:r.period,price:r.price,source_url:r.source_url});const history=NoorPrice.validateHistory([...merged.values()]);NoorPrice.forecast(priceModel,history);
 const reports=new Map((ucdaState?.reports||[]).map(r=>[r.reportDate,r]));for(const r of p.dailyHistory||[])reports.set(r.reportDate,r);reports.set(p.daily.reportDate,p.daily);const next={id:'ucda_reports_v1',downloadedAt:Date.now(),checkedAt:p.checkedAt,weather:p.weather||ucdaState?.weather||null,reports:[...reports.values()].sort((a,b)=>b.reportDate.localeCompare(a.reportDate)).slice(0,24)};
 await ready;await new Promise((resolve,reject)=>{const t=db.transaction('market_snapshots','readwrite'),s=t.objectStore('market_snapshots');s.put(next);s.put({id:'price_history_v2',importedAt:Date.now(),filename:'UCDA automatic report update',history});t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||Error('Report update was not saved.'));});
 priceHistory=history;ucdaState=next;renderForecast();renderUCDA();window.renderWeather?.();invalidate();$('#snapshotStatus').textContent='AI history updated through '+monthName(history.at(-1).period)+'.';
}
async function updateUCDA(){
 if(reportBusy)return;if(!navigator.onLine){$('#reportUpdateStatus').textContent='Offline · saved prices available.';return;}
 reportBusy=true;const button=$('#updateReports');button.disabled=true;button.setAttribute('aria-busy','true');$('#reportUpdateStatus').textContent='Downloading UCDA reports…';
 try{await window.noorPriceReady;const response=await fetch('/api/ucda'+(window.weatherAreaQuery?.()||''),{cache:'no-store',signal:AbortSignal.timeout(120000)}),payload=await response.json();if(!response.ok)throw Error(payload.error||'UCDA is unavailable right now.');await saveReportUpdate(payload);$('#reportUpdateStatus').textContent=(payload.weatherStatus==='unavailable'?'Prices saved · weather unavailable.':'Saved offline.');}
 catch(error){$('#reportUpdateStatus').textContent=(navigator.onLine?'Update failed. ':'Offline. ')+(ucdaState?'Your saved report was kept. ':'')+((error.name==='TimeoutError'||error.name==='AbortError')?'Try again later.':error.message);}
 finally{reportBusy=false;button.disabled=false;button.removeAttribute('aria-busy');}
}
$('#updateReports').onclick=updateUCDA;
window.noorReportsReady=(async()=>{try{
 await window.noorPriceReady;const saved=(await storeList('market_snapshots')).find(r=>r.id==='ucda_reports_v1');if(saved){ucdaState=saved;try{const seedResponse=await fetch('models/ucda_report_seed.json');if(seedResponse.ok){const seed=validateReportPayload(await seedResponse.json()),merged=new Map((seed.dailyHistory||[]).map(r=>[r.reportDate,r]));for(const r of seed.dailyHistory||[])validateReportPayload({...seed,daily:r});for(const r of saved.reports)merged.set(r.reportDate,r);ucdaState={...saved,reports:[...merged.values()].sort((a,b)=>b.reportDate.localeCompare(a.reportDate)).slice(0,24)};await storeRecord('market_snapshots',ucdaState);}}catch{}renderUCDA();if(priceModel&&priceHistory)renderForecast();$('#reportUpdateStatus').textContent='Available offline.';}
 else{const r=await fetch('models/ucda_report_seed.json');if(!r.ok)throw Error('No included report is available.');const p=validateReportPayload(await r.json());ucdaState={id:'ucda_reports_v1',downloadedAt:Date.now(),checkedAt:p.checkedAt,reports:[...new Map([...(p.dailyHistory||[]),p.daily].map(r=>[r.reportDate,r])).values()].sort((a,b)=>b.reportDate.localeCompare(a.reportDate)).slice(0,24)};await storeRecord('market_snapshots',ucdaState);renderUCDA();if(priceModel&&priceHistory)renderForecast();$('#reportUpdateStatus').textContent='Available offline.';}
 }catch(error){$('#ucdaLatestReport').replaceChildren(element('p','Connect and update UCDA reports.'));$('#reportUpdateStatus').textContent=error.message;}
})();
