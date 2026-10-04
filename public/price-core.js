(function(root){
  'use strict';
  function monthIndex(period){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))throw Error('Invalid price month.');const [y,m]=period.split('-').map(Number);return y*12+m-1;}
  function periodFor(index){return `${Math.floor(index/12)}-${String(index%12+1).padStart(2,'0')}`;}
  function predictReturn(model,values){
    if(model.algorithm==='standardized_ridge'){
      if(model.schema_version!==2||values.length!==model.features.length||!values.every(Number.isFinite)||![model.means,model.scales,model.coefficients].every(a=>Array.isArray(a)&&a.length===values.length&&a.every(Number.isFinite))||!model.scales.every(v=>v>0)||!Number.isFinite(model.intercept))throw Error('Invalid price model or inputs.');
      const result=model.intercept+values.reduce((sum,v,i)=>sum+(v-model.means[i])/model.scales[i]*model.coefficients[i],0);if(!Number.isFinite(result))throw Error('Invalid model prediction.');return result;
    }
    if(model.schema_version!==1||model.algorithm!=='histogram_gradient_boosting'||!model.trees?.length)throw Error('Unsupported price model.');
    if(values.length!==model.features.length||!values.every(Number.isFinite))throw Error('Missing price model inputs.');
    let sum=model.baseline_return;
    for(const tree of model.trees){let index=0,steps=0;while(true){const node=tree[index];if(!node||++steps>tree.length)throw Error('Invalid price model tree.');if(node[5]){sum+=node[4];break;}index=values[node[0]]<=node[1]?node[2]:node[3];}}
    if(!Number.isFinite(sum))throw Error('Price model returned an invalid estimate.');return sum;
  }
  function validateHistory(rows){
    if(!Array.isArray(rows)||rows.length<4||rows.length>500)throw Error('Price history needs 4–500 monthly records.');
    const seen=new Set();return rows.map(r=>{monthIndex(r.period);if(seen.has(r.period))throw Error('Duplicate price month.');seen.add(r.period);if(!Number.isFinite(r.price)||r.price<=0)throw Error('Invalid monthly parchment price.');return {...r};}).sort((a,b)=>a.period.localeCompare(b.period));
  }
  function forecast(model,history){
    const rows=validateHistory(history),byMonth=new Map(rows.map(r=>[r.period,r.price]));
    const last=rows.at(-1),lastIndex=monthIndex(last.period),get=n=>{const price=byMonth.get(periodFor(lastIndex-n));if(!Number.isFinite(price))throw Error('The model requires complete recent monthly history.');return price;};
    const p0=get(0),p1=get(1),p2=get(2),p3=get(3),target=periodFor(lastIndex+model.delay_months),month=Number(target.slice(5));
    const all={momentum_1:p0/p1-1,momentum_2:p1/p2-1,momentum_3:p2/p3-1,return_3:p0/p3-1,month_sin:Math.sin(2*Math.PI*month/12),month_cos:Math.cos(2*Math.PI*month/12)};
    if(model.algorithm==='standardized_ridge'){
      for(const lag of [1,2,3,6,12])all['return_'+lag]=p0/get(lag)-1;
      for(const lag of [3,6,12]){
        const prices=Array.from({length:lag},(_,i)=>get(i));all['mean_gap_'+lag]=p0/(prices.reduce((a,b)=>a+b,0)/lag)-1;
        const returns=Array.from({length:lag},(_,i)=>get(i)/get(i+1)-1),mean=returns.reduce((a,b)=>a+b,0)/lag;all['volatility_'+lag]=Math.sqrt(returns.reduce((sum,v)=>sum+(v-mean)**2,0)/lag);
      }
    }
    const movement=predictReturn(model,model.features.map(f=>all[f])),estimate=p0*(1+movement),band=p0*model.historical_relative_error_band;
    if(!Number.isFinite(estimate)||estimate<=0||!Number.isFinite(band)||band<0)throw Error('Could not produce a valid price estimate.');
    return {estimate,low:Math.max(0,estimate-band),high:estimate+band,movement,target,latestPeriod:last.period,latestPrice:p0,modelId:model.model_id,history:rows,experimental:true};
  }
  const api={monthIndex,periodFor,predictReturn,validateHistory,forecast};
  root.NoorPrice=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
