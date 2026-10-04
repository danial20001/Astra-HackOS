import { latestReports } from '../../../lib/ucda.mjs';
import { forecastWeather } from '../../../lib/weather.mjs';
export async function GET(request:Request){
 try{const params=new URL(request.url).searchParams,lat=params.get('latitude'),lon=params.get('longitude');
 const weatherTask=lat!==null&&lon!==null?forecastWeather(Number(lat),Number(lon)).then(weather=>({weather,weatherStatus:'available'})).catch(()=>({weather:null,weatherStatus:'unavailable'})):Promise.resolve({weather:null,weatherStatus:'not_requested'});
 const [reports,weather]=await Promise.all([latestReports(),weatherTask]);return Response.json({...reports,...weather},{headers:{'Cache-Control':'no-store'}});}
 catch(error){return Response.json({error:error instanceof Error?error.message:'Could not download market data.'},{status:502,headers:{'Cache-Control':'no-store'}});}
}
