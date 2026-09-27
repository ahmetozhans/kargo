import test from 'node:test';
import assert from 'node:assert/strict';

test('a 409 from another device merges distinct deliveries and respects address removal automatically',async()=>{
  const app={innerHTML:''},toast={textContent:'',classList:{add(){},remove(){}}},events={},values=new Map();
  const base={routes:[{id:'r',title:'Bursa dağıtımı',createdAt:new Date().toISOString(),start:{address:'Bursa',lat:40.2,lng:29},end:null,stops:[{id:'a',company:'A',address:'A, Bursa',lat:40.21,lng:29.01,status:'pending'},{id:'b',company:'B',address:'B, Bursa',lat:40.22,lng:29.02,status:'pending'}]}],addressBook:[{id:'old',company:'Eski',address:'Bursa',lat:40.2,lng:29}],activeId:'r'};
  let revision=1,cloud=structuredClone(base),writes=0,saved;
  globalThis.localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
  globalThis.document={querySelector:s=>s==='#app'?app:s==='#toast'?toast:null,addEventListener:(name,fn)=>{(events[name]??=[]).push(fn)}};
  globalThis.window={scrollTo:()=>{},addEventListener:()=>{}};
  globalThis.fetch=async(url,options={})=>{
    if(url==='/api/config')return {ok:true,json:async()=>({mode:'demo',syncEnabled:true})};
    if(url==='/api/session')return {ok:true,json:async()=>({user:{id:'owner',email:'owner@example.com'}})};
    if(url==='/api/sync'&&options.method==='GET')return {ok:true,json:async()=>({data:structuredClone(cloud),revision})};
    if(url==='/api/sync'&&options.method==='PUT'){
      writes++;
      const payload=JSON.parse(options.body);
      if(writes===1){revision=2;cloud.routes[0].stops[1].status='delivered';cloud.addressBook=[];cloud.deletedAddressIds=['old'];return {ok:false,status:409,json:async()=>({code:'CONFLICT',message:'Başka cihazda değişiklik var'})}}
      assert.equal(payload.revision,2);saved=payload.data;revision=3;cloud=structuredClone(saved);
      return {ok:true,json:async()=>({revision})};
    }
    throw Error('Unexpected request '+url);
  };
  const originalInterval=globalThis.setInterval;
  globalThis.setInterval=()=>0;
  try{
    await import('../public/app.js?conflict-integration');
    await new Promise(resolve=>setTimeout(resolve,30));
    const click=async(action,extra={})=>events.click[0]({target:{closest:selector=>selector==='.stopactions'?null:{dataset:{action,...extra}}},preventDefault:()=>{}});
    await click('screen',{screen:'route'});
    await click('deliver-next');
    await new Promise(resolve=>setTimeout(resolve,1900));
    assert.equal(writes,2);
    assert.deepEqual(saved.routes[0].stops.map(x=>x.status),['delivered','delivered']);
    assert.deepEqual(saved.addressBook,[]);
    assert.deepEqual(saved.deletedAddressIds,['old']);
    assert.match(app.innerHTML,/0 kaldı/);
    assert.equal(values.has('kargo.sync.pending.v1'),false);
  }finally{globalThis.setInterval=originalInterval;clearTimeout(globalThis.window.toastTimer)}
});
