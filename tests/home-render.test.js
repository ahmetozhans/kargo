import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateLocally} from '../public/route-timing.js';

test('signed-in delivery route shows next stop, controls, sorting, and map',async()=>{
  const app={innerHTML:''};
  let scrolls=0;
  const values=new Map();
  const events={};
  const route={id:'r',title:'27 Eylül dağıtımı',createdAt:new Date().toISOString(),start:{address:'Bursa merkez',lat:40.195,lng:29.06},end:null,stops:[{id:'s1',company:'Sawinmak',address:'Yücel Cd, Bursa',lat:40.2,lng:29.07,status:'pending',count:1},{id:'s2',company:'Penmak',address:'Kuleler Cd, Bursa',lat:40.21,lng:29.08,status:'pending',count:2}]};
  estimateLocally(route);
  globalThis.localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
  globalThis.document={querySelector:selector=>selector==='#app'?app:null,addEventListener:(type,handler)=>{(events[type]??=[]).push(handler)}};
  globalThis.window={scrollTo:()=>{scrolls++},addEventListener:()=>{}};
  globalThis.fetch=async url=>({ok:true,json:async()=>url==='/api/config'?{mode:'demo',syncEnabled:true}:url==='/api/session'?{user:{id:'owner',email:'owner@example.com'}}:{revision:1,data:{routes:[route],addressBook:[],activeId:'r'}}});
  const interval=globalThis.setInterval;
  globalThis.setInterval=()=>0;
  try{
    await import('../public/app.js');
    await new Promise(resolve=>setTimeout(resolve,30));
    assert.match(app.innerHTML,/Bugün nereye/);
    assert.equal(scrolls,1);
    const click=async(action,extra={})=>events.click[0]({target:{closest:()=>({dataset:{action,...extra}})},preventDefault:()=>{}});
    await click('screen',{screen:'route'});
    assert.match(app.innerHTML,/SIRADAKİ DURAK/);
    assert.match(app.innerHTML,/Sawinmak/);
    assert.match(app.innerHTML,/Rotayı optimize et/);
    assert.match(app.innerHTML,/data-action="toggle-sort"/);
    assert.doesNotMatch(app.innerHTML,/data-action="move"/);
    await click('toggle-sort');
    assert.match(app.innerHTML,/data-action="move"/);
    await click('set-view',{view:'map'});
    assert.match(app.innerHTML,/Şematik görünüm/);
  }finally{globalThis.setInterval=interval}
});
