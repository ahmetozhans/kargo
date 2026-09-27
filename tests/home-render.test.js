import test from 'node:test';
import assert from 'node:assert/strict';

test('signed-in home renders without a runtime reference error',async()=>{
  const app={innerHTML:''};
  let scrolls=0;
  const values=new Map();
  globalThis.localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
  globalThis.document={querySelector:selector=>selector==='#app'?app:null,addEventListener:()=>{}};
  globalThis.window={scrollTo:()=>{scrolls++},addEventListener:()=>{}};
  globalThis.fetch=async url=>({ok:true,json:async()=>url==='/api/config'?{mode:'demo',syncEnabled:true}:url==='/api/session'?{user:{id:'owner',email:'owner@example.com'}}:{revision:1,data:{routes:[],addressBook:[],activeId:null}}});
  const interval=globalThis.setInterval;
  globalThis.setInterval=()=>0;
  try{
    await import('../public/app.js');
    await new Promise(resolve=>setTimeout(resolve,30));
    assert.match(app.innerHTML,/Bugün nereye/);
    assert.equal(scrolls,1);
  }finally{globalThis.setInterval=interval}
});
