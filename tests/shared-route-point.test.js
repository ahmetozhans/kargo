import test from 'node:test';
import assert from 'node:assert/strict';

test('the saved address drives both ends of open and new routes without rewriting history',async()=>{
  const app={innerHTML:''},toast={textContent:'',classList:{add(){},remove(){}}},values=new Map(),events={};
  const center={address:'Bursa merkez',lat:40.195,lng:29.06};
  const active={id:'active',title:'Açık rota',createdAt:new Date().toISOString(),start:{...center},end:{...center},stops:[{id:'s',company:'Teslimat',address:'Çekirge, Bursa',lat:40.198,lng:29.04,status:'pending'}]};
  const archived={id:'history',title:'Eski rota',createdAt:new Date().toISOString(),finishedAt:new Date().toISOString(),start:{...center},end:{...center},stops:[]};
  const originalArchive=structuredClone(archived);
  globalThis.localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
  const fields={'#return-address':{value:'Dobruca Mahallesi, 2. Sokak No: 12, Osmangazi/Bursa'},'#route-title':{value:'Yeni rota'}};
  globalThis.document={querySelector:s=>s==='#app'?app:s==='#toast'?toast:fields[s]||null,addEventListener:(name,fn)=>{(events[name]??=[]).push(fn)}};
  globalThis.window={scrollTo:()=>{},addEventListener:()=>{}};
  globalThis.fetch=async(url,options={})=>({ok:true,json:async()=>url==='/api/config'?{mode:'demo',syncEnabled:true}:url==='/api/session'?{user:{id:'owner',email:'owner@example.com'}}:url==='/api/sync'&&options.method==='PUT'?{revision:2}:{revision:1,data:{routes:[active,archived],addressBook:[],activeId:'active'}}});
  const originalInterval=globalThis.setInterval;
  globalThis.setInterval=()=>0;
  globalThis.confirm=()=>true;
  try{
    await import('../public/app.js?shared-route-point');
    await new Promise(resolve=>setTimeout(resolve,20));
    const click=async(action,extra={})=>events.click[0]({target:{closest:selector=>selector==='.stopactions'?null:{dataset:{action,...extra}}},preventDefault:()=>{}});
    await click('screen',{screen:'settings'});
    await click('save-return');
    const saved=JSON.parse(values.get('kargo.routes.v1'));
    assert.match(app.innerHTML,/Başlangıç ve dönüş adresi/);
    assert.match(active.start.address,/Dobruca/);
    assert.deepEqual(active.start,active.end);
    assert.deepEqual(saved.routes.find(x=>x.id==='history'),originalArchive);
    await click('screen',{screen:'route'});
    await click('deliver-next');
    await click('arrive-return');
    await click('finish');
    await click('new');
    assert.match(app.innerHTML,/BAŞLANGIÇ VE SON DURAK/);
    await click('save-route');
    const latest=JSON.parse(values.get('kargo.routes.v1')).routes.at(-1);
    assert.deepEqual(latest.start,latest.end);
    assert.match(latest.start.address,/Dobruca/);
    await click('screen',{screen:'settings'});
    await click('remove-return');
    const reset=JSON.parse(values.get('kargo.routes.v1')).routes.at(-1);
    assert.equal(reset.start.address,'Bursa merkez');
    assert.deepEqual(reset.start,reset.end);
    assert.deepEqual(archived,originalArchive);
  }finally{globalThis.setInterval=originalInterval;clearTimeout(globalThis.window.toastTimer)}
});

test('an existing open route adopts the saved shared address when older data loads',async()=>{
  const app={innerHTML:''},events={},values=new Map();
  const depot={address:'Nilüfer Ticaret Merkezi, Bursa',lat:40.22,lng:28.98,placeId:'depot'};
  const route={id:'r',createdAt:new Date().toISOString(),start:{address:'Bursa merkez',lat:40.195,lng:29.06},end:{...depot},stops:[{id:'a',status:'pending',address:'Nilüfer, Bursa',lat:40.21,lng:29.02}]};
  const past={id:'past',finishedAt:new Date().toISOString(),start:{address:'Bursa merkez',lat:40.195,lng:29.06},end:{...depot},stops:[]};
  globalThis.localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
  globalThis.document={querySelector:s=>s==='#app'?app:null,addEventListener:(type,fn)=>{(events[type]??=[]).push(fn)}};
  globalThis.window={scrollTo:()=>{},addEventListener:()=>{}};
  globalThis.fetch=async(url,options={})=>({ok:true,json:async()=>url==='/api/config'?{mode:'demo',syncEnabled:true}:url==='/api/session'?{user:{id:'owner',email:'owner@example.com'}}:url==='/api/sync'&&options.method==='PUT'?{revision:2}:{revision:1,data:{routes:[route,past],addressBook:[],activeId:'r',returnAddress:depot}}});
  const interval=globalThis.setInterval;globalThis.setInterval=()=>0;
  try{
    await import('../public/app.js?shared-route-migration');
    await new Promise(resolve=>setTimeout(resolve,30));
    const stored=JSON.parse(values.get('kargo.routes.v1'));
    assert.deepEqual(stored.routes[0].start,stored.routes[0].end);
    assert.equal(stored.routes[0].start.address,depot.address);
    assert.equal(stored.routes[1].start.address,'Bursa merkez');
  }finally{globalThis.setInterval=interval}
});
