const norm=value=>String(value||'').toLocaleLowerCase('tr-TR').trim();
const key=entry=>entry.id||norm(entry.address);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

export function reconcileSnapshots(cloud,local,base){
  const remote=cloud||{routes:[],addressBook:[]},mine=local||{routes:[],addressBook:[]},prior=base||{routes:[],addressBook:[]};
  const conflicts=[];
  const field=(server,client,original,path)=>{
    if(same(client,original))return server;
    if(!same(server,original)&&!same(server,client)){conflicts.push(path);return server}
    return client;
  };
  const mergeObject=(server,client,original,path)=>{
    const result={...server};
    for(const prop of new Set([...Object.keys(client||{}),...Object.keys(original||{})])){
      if(prop==='stops')continue;
      const value=field(server?.[prop],client?.[prop],original?.[prop],`${path}.${prop}`);
      if(value===undefined)delete result[prop];else result[prop]=value;
    }
    return result;
  };
  const originalRoutes=new Map((prior.routes||[]).map(r=>[r.id,r]));
  const localRoutes=new Map((mine.routes||[]).map(r=>[r.id,r]));
  const routes=new Map((remote.routes||[]).map(r=>[r.id,r]));
  for(const [id,client] of localRoutes){
    const server=routes.get(id),original=originalRoutes.get(id);
    if(!server){if(!original)routes.set(id,client);else conflicts.push(`Rota ${id} bulutta silinmiş`);continue}
    if(server.finishedAt){if(!same(server,client))conflicts.push(`Rota ${id} tamamlanmış`);continue}
    const stops=new Map((server.stops||[]).map(s=>[s.id,s]));
    const originalStops=new Map((original?.stops||[]).map(s=>[s.id,s]));
    for(const stop of client.stops||[]){
      const saved=stops.get(stop.id),was=originalStops.get(stop.id);
      if(!saved){if(!was)stops.set(stop.id,stop);else conflicts.push(`Durak ${stop.id} silinmiş`);continue}
      if(!was){if(!same(saved,stop))conflicts.push(`Durak ${stop.id} iki cihazda değişmiş`);continue}
      const merged=mergeObject(saved,stop,was,`Durak ${stop.id}`);
      if(saved.status!=='pending'&&stop.status==='pending')merged.status=saved.status;
      else if(saved.status==='pending'&&stop.status!=='pending')merged.status=stop.status;
      stops.set(stop.id,merged);
    }
    const ids=list=>(list||[]).map(s=>s.id);
    const localOrder=ids(client.stops),remoteOrder=ids(server.stops),baseOrder=ids(original?.stops);
    const localExisting=localOrder.filter(id=>baseOrder.includes(id));
    const remoteExisting=remoteOrder.filter(id=>baseOrder.includes(id));
    const mineChanged=!same(localExisting,baseOrder),theirsChanged=!same(remoteExisting,baseOrder);
    if(mineChanged&&theirsChanged&&!same(localExisting,remoteExisting))conflicts.push(`Rota ${id} sırası`);
    const order=mineChanged&&!theirsChanged?localOrder:remoteOrder;
    const ordered=[...order.map(s=>stops.get(s)).filter(Boolean),...[...stops.values()].filter(s=>!order.includes(s.id))];
    const merged=mergeObject(server,client,original||{},`Rota ${id}`);
    merged.stops=ordered;
    if(merged.finishedAt&&(ordered.some(s=>s.status==='pending')||merged.end&&!merged.returnReachedAt)){
      delete merged.finishedAt;conflicts.push(`Rota ${id} bitişi`);
    }
    routes.set(id,merged);
  }
  const deletedAddressIds=[...new Set([...(remote.deletedAddressIds||[]),...(mine.deletedAddressIds||[])])];
  const deleted=new Set(deletedAddressIds);
  const originalBook=new Map((prior.addressBook||[]).map(x=>[key(x),x]));
  const book=new Map((remote.addressBook||[]).filter(x=>!deleted.has(key(x))).map(x=>[key(x),x]));
  for(const entry of mine.addressBook||[]){
    const id=key(entry);if(deleted.has(id))continue;
    const server=book.get(id),original=originalBook.get(id);
    if(!server){if(!original)book.set(id,entry);else conflicts.push(`Adres ${id} silinmiş`)}
    else if(original)book.set(id,mergeObject(server,entry,original,`Adres ${id}`));
    else if(!same(server,entry))conflicts.push(`Adres ${id} iki cihazda değişmiş`);
  }
  const returnAddress=field(remote.returnAddress,mine.returnAddress,prior.returnAddress,'Dönüş adresi');
  const activeId=routes.has(remote.activeId)?remote.activeId:routes.has(mine.activeId)?mine.activeId:null;
  return {data:{routes:[...routes.values()],addressBook:[...book.values()],deletedAddressIds,activeId,returnAddress:returnAddress||null},conflicts};
}

export function mergeSnapshots(cloud,local,{preferLocal=false}={}){
  const first=cloud||{routes:[],addressBook:[],activeId:null};
  const second=local||{routes:[],addressBook:[],activeId:null};
  const routes=new Map((first.routes||[]).map(route=>[route.id,route]));
  for(const route of second.routes||[]){
    if(!routes.has(route.id)){routes.set(route.id,route);continue}
    const remote=routes.get(route.id);
    // A completed cloud route is an archive. A stale device must not reopen it.
    if(remote.finishedAt)continue;
    const stops=new Map((remote.stops||[]).map(stop=>[stop.id,stop]));
    for(const stop of route.stops||[]){
      const saved=stops.get(stop.id);
      if(!saved){stops.set(stop.id,stop);continue}
      if(preferLocal||saved.status==='pending'&&stop.status!=='pending'){
        const merged={...saved,...stop};
        // Never turn a confirmed delivery back into a pending stop.
        if(saved.status!=='pending'&&stop.status==='pending')merged.status=saved.status;
        if(saved.status==='pending'&&stop.status!=='pending')merged.status=stop.status;
        if(saved.status!=='pending'&&stop.status!=='pending'&&saved.status!==stop.status)merged.status=saved.status;
        stops.set(stop.id,merged);
      }
    }
    const preferred=preferLocal?route:remote;
    const order=preferLocal?(route.stops||[]):(remote.stops||[]);
    const ordered=[...order.map(s=>stops.get(s.id)).filter(Boolean),...[...stops.values()].filter(s=>!order.some(x=>x.id===s.id))];
    const mergedRoute={...(preferLocal?remote:route),...preferred,stops:ordered};
    if(route.finishedAt&&ordered.every(s=>s.status!=='pending'))mergedRoute.finishedAt=route.finishedAt;
    else delete mergedRoute.finishedAt;
    routes.set(route.id,mergedRoute);
  }
  const deletedAddressIds=[...new Set([...(first.deletedAddressIds||[]),...(second.deletedAddressIds||[])])];
  const deleted=new Set(deletedAddressIds);
  const book=new Map();
  for(const entry of first.addressBook||[])if(!deleted.has(key(entry)))book.set(key(entry),entry);
  for(const entry of second.addressBook||[]){const existing=book.get(key(entry));if(!deleted.has(key(entry))&&(!existing||preferLocal))book.set(key(entry),entry)}
  const returnAddress=preferLocal&&'returnAddress' in second?second.returnAddress:'returnAddress' in first?first.returnAddress:second.returnAddress;
  const merged={routes:[...routes.values()],addressBook:[...book.values()],activeId:first.activeId||second.activeId||null,returnAddress:returnAddress||null};
  if(deletedAddressIds.length||'deletedAddressIds' in first||'deletedAddressIds' in second)merged.deletedAddressIds=deletedAddressIds;
  if(merged.activeId&&!routes.has(merged.activeId))merged.activeId=second.activeId&&routes.has(second.activeId)?second.activeId:null;
  return merged;
}

export function hasLocalOnly(cloud,local){
  if(!local)return false;
  if(!cloud)return Boolean(local.routes?.length||local.addressBook?.length||local.returnAddress||local.deletedAddressIds?.length);
  if(local.returnAddress&&!cloud.returnAddress)return true;
  if((local.deletedAddressIds||[]).some(id=>!(cloud.deletedAddressIds||[]).includes(id)))return true;
  const ids=new Set((cloud.routes||[]).map(route=>route.id));
  if((local.routes||[]).some(route=>!ids.has(route.id)))return true;
  const remoteRoutes=new Map((cloud.routes||[]).map(route=>[route.id,new Set((route.stops||[]).map(stop=>stop.id))]));
  if((local.routes||[]).some(route=>(route.stops||[]).some(stop=>!remoteRoutes.get(route.id)?.has(stop.id))))return true;
  const books=new Set((cloud.addressBook||[]).map(key));
  return (local.addressBook||[]).some(entry=>!books.has(key(entry)));
}
