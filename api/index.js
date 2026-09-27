const BURSA = { latitude: 40.195, longitude: 29.06 };
const limits = new Map();
const json = (res, status, data) => res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}).end(JSON.stringify(data));
const coord = p => p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)) && Math.abs(+p.lat)<=90 && Math.abs(+p.lng)<=180;
const point = p => ({location:{latLng:{latitude:+p.lat,longitude:+p.lng}}});
function allow(kind, cap){
  const day = new Date().toISOString().slice(0,10), key = `${kind}:${day}`;
  const used=limits.get(key)||0; if(used>=cap) return false; limits.set(key,used+1); return true;
}
async function google(url, options={}){
  const response = await fetch(url,{...options,signal:AbortSignal.timeout(12000)});
  const data=await response.json().catch(()=>({}));
  if (!response.ok || data.status && data.status!=='OK' && data.status!=='ZERO_RESULTS') {
    const err = new Error(data.error?.message||data.error_message||'Google servisine ulaşılamadı');
    err.status=response.status===429||data.status==='OVER_QUERY_LIMIT'||data.error?.status==='RESOURCE_EXHAUSTED'?429:502;
    throw err;
  }
  return data;
}
async function body(req){
  if(req.body && typeof req.body==='object') return req.body;
  let raw=''; for await(const chunk of req){raw+=chunk;if(raw.length>40000) throw Object.assign(new Error('İstek çok büyük'),{status:413});}
  try{return JSON.parse(raw||'{}');}catch{throw Object.assign(new Error('Geçersiz JSON'),{status:400});}
}
export default async function handler(req,res){
  const url=new URL(req.url,'http://localhost');
  const endpoint=(url.searchParams.get('endpoint')||url.pathname.replace(/^\/api\//,'')).replace(/\/$/,'');
  const key=process.env.GOOGLE_MAPS_SERVER_KEY;
  try{
    if(endpoint==='config' && req.method==='GET') return json(res,200,{mode:key?'live':'demo',browserKey:key?(process.env.GOOGLE_MAPS_BROWSER_KEY||''):'' ,optimizationEnabled:process.env.ENABLE_GOOGLE_OPTIMIZATION==='1'});
    if(!key) return json(res,503,{code:'DEMO_MODE',message:'Google anahtarı ayarlı değil; demo rotası kullanılabilir.'});
    if(endpoint==='search' && req.method==='GET'){
      const q=(url.searchParams.get('q')||'').trim();if(q.length<3||q.length>180) return json(res,400,{message:'En az 3 karakter girin.'});
      if(!allow('places',Number(process.env.DAILY_PLACES_LIMIT)||100)) return json(res,429,{code:'QUOTA',message:'Adres arama için uygulama günlük sınırına ulaştı.'});
      const data=await google('https://places.googleapis.com/v1/places:autocomplete',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key},body:JSON.stringify({input:q,languageCode:'tr',regionCode:'TR',includedRegionCodes:['tr'],locationBias:{circle:{center:BURSA,radius:45000}}})});
      return json(res,200,{results:(data.suggestions||[]).filter(x=>x.placePrediction).slice(0,5).map(x=>({label:x.placePrediction.text?.text||'',placeId:x.placePrediction.placeId}))});
    }
    if(endpoint==='geocode' && req.method==='POST'){
      const input=await body(req);const address=String(input.address||'').trim();
      if(address.length<7||address.length>240)return json(res,400,{message:'Mahalle, sokak ve kapı numarasıyla daha açık adres girin.'});
      if(!allow('geocode',Number(process.env.DAILY_GEOCODE_LIMIT)||100))return json(res,429,{code:'QUOTA',message:'Adres doğrulama günlük sınırına ulaştı.'});
      const params=new URLSearchParams({address:`${address}, Türkiye`,language:'tr',region:'tr',key});
      const data=await google(`https://maps.googleapis.com/maps/api/geocode/json?${params}`);
      return json(res,200,{results:(data.results||[]).slice(0,5).map(x=>({address:x.formatted_address,lat:x.geometry.location.lat,lng:x.geometry.location.lng,placeId:x.place_id,partial:x.partial_match||false}))});
    }
    if(endpoint==='place' && req.method==='GET'){
      const placeId=url.searchParams.get('id')||'';
      if(!/^[\w:-]{6,250}$/.test(placeId))return json(res,400,{message:'Geçersiz yer kimliği.'});
      if(!allow('places',Number(process.env.DAILY_PLACES_LIMIT)||100))return json(res,429,{code:'QUOTA',message:'Adres arama günlük sınırına ulaştı.'});
      const data=await google(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=tr`,{headers:{'X-Goog-Api-Key':key,'X-Goog-FieldMask':'id,formattedAddress,location'}});
      return json(res,200,{address:data.formattedAddress,lat:data.location?.latitude,lng:data.location?.longitude,placeId:data.id});
    }
    if(endpoint==='route' && req.method==='POST'){
      const input=await body(req), optimize=input.optimize===true;
      const stops=input.stops||[];
      if(!coord(input.start)||!Array.isArray(stops)||stops.length<1||stops.length>25||!stops.every(coord)||input.end&&!coord(input.end))return json(res,400,{message:'Başlangıç ve 1–25 geçerli durak gereklidir.'});
      if(optimize&&process.env.ENABLE_GOOGLE_OPTIMIZATION!=='1')return json(res,403,{code:'OPT_DISABLED',message:'Google Pro optimizasyonu kapalı. Durakları elle sıralayabilirsiniz.'});
      if(optimize&&stops.length<2)return json(res,400,{message:'Optimizasyon için en az iki durak gereklidir.'});
      if(!allow(optimize?'optimize':'route',Number(process.env[optimize?'DAILY_OPTIMIZE_LIMIT':'DAILY_ROUTES_LIMIT'])||(optimize?5:30)))return json(res,429,{code:'QUOTA',message:'Günlük rota kotası doldu. Durakları elle sıralayabilirsiniz.'});
      const destination=input.end||stops.at(-1);
      const via=input.end?stops:stops.slice(0,-1);
      const payload={origin:point(input.start),destination:point(destination),intermediates:via.map(point),travelMode:'DRIVE',routingPreference:'TRAFFIC_UNAWARE',computeAlternativeRoutes:false,languageCode:'tr-TR',units:'METRIC',optimizeWaypointOrder:optimize};
      const fields='routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.duration,routes.legs.distanceMeters'+(optimize?',routes.optimizedIntermediateWaypointIndex':'');
      const data=await google('https://routes.googleapis.com/directions/v2:computeRoutes',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':fields},body:JSON.stringify(payload)});
      const route=data.routes?.[0];if(!route)return json(res,422,{message:'Bu duraklar için rota bulunamadı.'});
      return json(res,200,{distanceMeters:route.distanceMeters,durationSeconds:Number((route.duration||'0s').replace('s','')),encodedPolyline:route.polyline?.encodedPolyline,legs:(route.legs||[]).map(l=>({distanceMeters:l.distanceMeters,durationSeconds:Number((l.duration||'0s').replace('s',''))})),order:optimize?[...(route.optimizedIntermediateWaypointIndex||[]),...(input.end?[]:[via.length])]:null});
    }
    return json(res,404,{message:'İşlem bulunamadı.'});
  }catch(e){return json(res,e.status||502,{code:e.status===429?'QUOTA':'API_ERROR',message:e.message||'Servis hatası'});}
}
