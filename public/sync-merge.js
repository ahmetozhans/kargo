const norm=value=>String(value||'').toLocaleLowerCase('tr-TR').trim();
const key=entry=>entry.id||norm(entry.address);

export function mergeSnapshots(cloud,local,{preferLocal=false}={}){
  const first=cloud||{routes:[],addressBook:[],activeId:null};
  const second=local||{routes:[],addressBook:[],activeId:null};
  const routes=new Map((first.routes||[]).map(route=>[route.id,route]));
  for(const route of second.routes||[]){
    if(!routes.has(route.id)){routes.set(route.id,route);continue}
    const remote=routes.get(route.id);
    const stops=new Map((remote.stops||[]).map(stop=>[stop.id,stop]));
    for(const stop of route.stops||[]){
      const saved=stops.get(stop.id);
      if(!saved){stops.set(stop.id,stop);continue}
      if(preferLocal||saved.status==='pending'&&stop.status!=='pending')stops.set(stop.id,{...saved,...stop});
    }
    routes.set(route.id,{...(preferLocal?remote:route),...(preferLocal?route:remote),stops:[...stops.values()]});
  }
  const book=new Map();
  for(const entry of first.addressBook||[])book.set(key(entry),entry);
  for(const entry of second.addressBook||[]){const existing=book.get(key(entry));if(!existing||preferLocal)book.set(key(entry),entry)}
  const returnAddress=preferLocal&&'returnAddress' in second?second.returnAddress:'returnAddress' in first?first.returnAddress:second.returnAddress;
  const merged={routes:[...routes.values()],addressBook:[...book.values()],activeId:first.activeId||second.activeId||null,returnAddress:returnAddress||null};
  if(merged.activeId&&!routes.has(merged.activeId))merged.activeId=second.activeId&&routes.has(second.activeId)?second.activeId:null;
  return merged;
}

export function hasLocalOnly(cloud,local){
  if(!local)return false;
  if(!cloud)return Boolean(local.routes?.length||local.addressBook?.length||local.returnAddress);
  if(local.returnAddress&&!cloud.returnAddress)return true;
  const ids=new Set((cloud.routes||[]).map(route=>route.id));
  if((local.routes||[]).some(route=>!ids.has(route.id)))return true;
  const remoteRoutes=new Map((cloud.routes||[]).map(route=>[route.id,new Set((route.stops||[]).map(stop=>stop.id))]));
  if((local.routes||[]).some(route=>(route.stops||[]).some(stop=>!remoteRoutes.get(route.id)?.has(stop.id))))return true;
  const books=new Set((cloud.addressBook||[]).map(key));
  return (local.addressBook||[]).some(entry=>!books.has(key(entry)));
}
