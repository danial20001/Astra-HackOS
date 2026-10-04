import json
from pathlib import Path
import numpy as np,pandas as pd
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import Ridge
R=Path(__file__).parent; raw=pd.read_csv(R/'enriched_history.csv');s=raw.set_index(pd.PeriodIndex(raw.period,freq='M')).price_low.astype(float).reindex(pd.period_range(raw.period.iloc[0],raw.period.iloc[-1],freq='M'))
p=s.shift(2);x=pd.DataFrame(index=s.index)
for lag in [1,2,3,6,12]:x['return_'+str(lag)]=p/s.shift(2+lag)-1
for lag in [3,6,12]:x['mean_gap_'+str(lag)]=p/p.rolling(lag).mean()-1;x['volatility_'+str(lag)]=p.pct_change(fill_method=None).rolling(lag).std(ddof=0)
x['month_sin']=np.sin(2*np.pi*x.index.month/12);x['month_cos']=np.cos(2*np.pi*x.index.month/12);x['anchor']=p;x['y']=s/p-1;x['actual']=s;x=x.dropna();dev=x.iloc[:-15];test=x.iloc[-15:]
sets=[['return_1','return_3','return_6','mean_gap_6','volatility_6'],['return_1','return_3','return_6','return_12','mean_gap_6','mean_gap_12','volatility_6','volatility_12'],['return_1','return_3','return_6','return_12','mean_gap_6','mean_gap_12','volatility_6','volatility_12','month_sin','month_cos']]
results=[]
for f in sets:
 for alpha in [10,100,1000]:
  errs=[]
  for i in range(24,len(dev)):
   tr=dev.iloc[:i-1];m=make_pipeline(StandardScaler(with_mean=False),Ridge(alpha=alpha,fit_intercept=False));m.fit(tr[f],tr.y);pred=dev.iloc[i].anchor*(1+m.predict(dev.iloc[[i]][f])[0]);errs.append(abs(pred-dev.iloc[i].actual))
  results.append({'features':f,'alpha':alpha,'cv_mae':float(np.mean(errs))})
best=min(results,key=lambda r:r['cv_mae']);f=best['features'];pred=[];errors=[]
# At each origin only outcomes available by the two-month delayed input month can be used.
for i in range(len(dev),len(x)):
 tr=x.iloc[:i-1];m=make_pipeline(StandardScaler(with_mean=False),Ridge(alpha=best['alpha'],fit_intercept=False));m.fit(tr[f],tr.y);v=float(x.iloc[i].anchor*(1+m.predict(x.iloc[[i]][f])[0]));pred.append(v);errors.append(abs(v-x.iloc[i].actual)/x.iloc[i].anchor)
actual=test.actual.to_numpy();baseline=test.anchor.to_numpy();mae=float(np.mean(abs(actual-pred)));base=float(np.mean(abs(actual-baseline)))
final=make_pipeline(StandardScaler(with_mean=False),Ridge(alpha=best['alpha'],fit_intercept=False));final.fit(x[f],x.y);sc,reg=final.steps[0][1],final.steps[1][1]
# Band from earlier rolling development errors only, not evaluation residuals.
cal=[]
for i in range(24,len(dev)):
 tr=dev.iloc[:i-1];m=make_pipeline(StandardScaler(with_mean=False),Ridge(alpha=best['alpha'],fit_intercept=False));m.fit(tr[f],tr.y);cal.append(abs(m.predict(dev.iloc[[i]][f])[0]-dev.iloc[i].y))
model={'schema_version':2,'model_id':'noor-price-long-history-v3','algorithm':'standardized_ridge','features':f,'means':[0.0]*len(f),'scales':sc.scale_.tolist(),'coefficients':reg.coef_.tolist(),'intercept':float(reg.intercept_),'delay_months':2,'historical_relative_error_band':float(np.quantile(cal,.8)),'status':'experimental','evaluation':{'mae':mae,'baseline_mae':base,'mape':float(np.mean(abs(actual-pred)/actual)*100),'months':15,'note':'Retrospective rolling-origin evaluation; these months were inspected in prior versions.'}}
fixed=make_pipeline(StandardScaler(with_mean=False),Ridge(alpha=best['alpha'],fit_intercept=False));fixed.fit(dev.iloc[:-2][f],dev.iloc[:-2].y);fp=test.anchor*(1+fixed.predict(test[f]));model['evaluation']['fixed_weight_mae']=float(np.mean(abs(fp-test.actual)))
(R/'model.json').write_text(json.dumps(model,separators=(',',':')));(R/'evaluation.json').write_text(json.dumps({'selected':best,'candidates':results,'evaluation':model['evaluation'],'predictions':[{'period':str(i),'actual':float(a),'predicted':float(p),'baseline':float(b)} for i,a,p,b in zip(test.index,actual,pred,baseline)]},indent=2));(R/'parity.json').write_text(json.dumps([{'features':r[f].tolist(),'prediction':float(v)}for (_,r),v in zip(x.iterrows(),final.predict(x[f]))]));print(json.dumps({'best':best,'evaluation':model['evaluation'],'bytes':(R/'model.json').stat().st_size},indent=2))

fixed=make_pipeline(StandardScaler(with_mean=False),Ridge(alpha=best['alpha'],fit_intercept=False));fixed.fit(dev.iloc[:-2][f],dev.iloc[:-2].y);fp=test.anchor*(1+fixed.predict(test[f]));print('Fixed-weight retrospective MAE',float(np.mean(abs(fp-test.actual))))
