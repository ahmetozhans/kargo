import test from 'node:test';
import assert from 'node:assert/strict';

test('cached route opens without a connection and delivery syncs after reconnect',async()=>{
  const app={innerHTML:''},toast={textContent:'',classList:{add(){},remove(){}}},events={},values=new Map();
  const route={id:'r',title:'Bursa dağıtımı',createdAt:new Date().toISOString(),start:{address:'Bursa merkez',lat:40.195,lng:29.06},end:null,stops:[{id:'a',company:'A',address:'Nilüfer, Bursa',lat:40.2,lng:29.08,status:'pending'}]};
  const remote={routes:[structuredClone(route)],addressBook:[],activeId:'r'};
  values.set('kargo.local.owner','owner');values.set('kargo.routes.v1',JSON.stringify(remote));
  globalThis.localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
  globalThis.document={querySelector:s=>s==='#app'?app:s==='#toast'?toast:null,addEventListener:(type,fn)=>{(events[type]??=[]).push(fn)}};
  globalThis.window={scrollTo:()=>{},addEventListener:(type,fn)=>{(events[type]??=[]).push(fn)}};
  let online=false,saved=null;
  globalThis.fetch=async(url,options={})=>{
    if(!online)throw Error('No network');
    const data=url==='/api/config'?{mode:'demo',syncEnabled:true}
      :url==='/api/session'?{user:{id:'owner',email:'owner@example.com'}}
      :url==='/api/sync'&&options.method==='GET'?{revision:1,data:structuredClone(remote)}
      :url==='/api/sync'&&options.method==='PUT'?((saved=JSON.parse(options.body).data),{revision:2})
      :null;
    if(!data)throw Error('Unexpected request '+url);
    return {ok:true,json:async()=>data};
  };
  const interval=globalThis.setInterval;
  globalThis.setInterval=()=>0;
  try{
    await import('../public/app.js?offline-recovery');
    await new Promise(resolve=>setTimeout(resolve,10));
    assert.match(app.innerHTML,/Çevrimdışı/);
    const click=async(action,extra={})=>events.click[0]({target:{closest:selector=>selector==='.stopactions'?null:{dataset:{action,...extra}}},preventDefault:()=>{}});
    await click('screen',{screen:'route'});
    await click('deliver-next');
    assert.equal(JSON.parse(values.get('kargo.routes.v1')).routes[0].stops[0].status,'delivered');
    online=true;
    await events.online[0]();
    assert.equal(saved?.routes[0].stops[0].status,'delivered');
    assert.equal(values.has('kargo.sync.pending.v1'),false);
  }finally{globalThis.setInterval=interval;clearTimeout(globalThis.window.toastTimer)}
});
