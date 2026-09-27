import test from 'node:test';
import assert from 'node:assert/strict';
import {hasLocalOnly,mergeSnapshots,reconcileSnapshots} from '../public/sync-merge.js';

test('restores missing addresses and stops while preserving other cloud records',()=>{
  const cloud={routes:[{id:'r',title:'Güncel',stops:[{id:'s1',status:'delivered'}]}],addressBook:[{id:'a1',address:'A'}],activeId:'r'};
  const local={routes:[{id:'r',title:'Eski',stops:[{id:'s1',status:'pending'},{id:'s2',status:'pending'}]},{id:'old',stops:[]}],addressBook:[{id:'a2',address:'B'}],activeId:'old'};
  assert.equal(hasLocalOnly(cloud,local),true);
  const merged=mergeSnapshots(cloud,local);
  assert.equal(merged.routes.length,2);
  assert.equal(merged.routes[0].stops.length,2);
  assert.equal(merged.routes[0].stops[0].status,'delivered');
  assert.equal(merged.addressBook.length,2);
  assert.equal(merged.activeId,'r');
});

test('an unsynced local delivery remains delivered during conflict recovery',()=>{
  const cloud={routes:[{id:'r',stops:[{id:'s',status:'pending'}]}],addressBook:[],activeId:'r'};
  const local={routes:[{id:'r',stops:[{id:'s',status:'delivered'}]}],addressBook:[],activeId:'r'};
  const merged=mergeSnapshots(cloud,local,{preferLocal:true});
  assert.equal(merged.routes[0].stops[0].status,'delivered');
  assert.equal(hasLocalOnly(cloud,local),false);
});

test('a stale pending stop cannot undo a delivery saved from another device',()=>{
  const cloud={routes:[{id:'r',stops:[{id:'s',status:'delivered'}]}],addressBook:[]};
  const local={routes:[{id:'r',stops:[{id:'s',status:'pending'}]}],addressBook:[]};
  assert.equal(mergeSnapshots(cloud,local,{preferLocal:true}).routes[0].stops[0].status,'delivered');
});

test('stale device data cannot reopen a completed cloud route',()=>{
  const cloud={routes:[{id:'r',finishedAt:'today',stops:[{id:'s',status:'delivered'}]}],addressBook:[]};
  const local={routes:[{id:'r',stops:[{id:'s',status:'pending'}]}],addressBook:[]};
  assert.deepEqual(mergeSnapshots(cloud,local,{preferLocal:true}).routes[0],cloud.routes[0]);
});

test('a blank new cloud does not erase locally entered records',()=>{
  const local={routes:[{id:'r',stops:[{id:'s',status:'pending'}]}],addressBook:[{id:'a',address:'Bursa'}],activeId:'r',returnAddress:null};
  assert.equal(hasLocalOnly(null,local),true);
  assert.deepEqual(mergeSnapshots(null,local),local);
});

test('shared return address survives recovery and an intentional removal stays removed',()=>{
  const location={address:'Depo, Bursa',lat:40.2,lng:29.1};
  const cloud={routes:[],addressBook:[],activeId:null,returnAddress:location};
  const local={routes:[],addressBook:[],activeId:null,returnAddress:null};
  assert.equal(mergeSnapshots(cloud,local).returnAddress,location);
  assert.equal(mergeSnapshots(cloud,local,{preferLocal:true}).returnAddress,null);
  assert.equal(hasLocalOnly({...cloud,returnAddress:null},{...local,returnAddress:location}),true);
});

test('a deleted business cannot reappear from an older device and undo gets a new identity',()=>{
  const old={id:'old',company:'Dobruca',address:'Dobruca, Bursa'};
  const cloud={routes:[],addressBook:[],deletedAddressIds:['old']};
  const stale={routes:[],addressBook:[old]};
  assert.deepEqual(mergeSnapshots(cloud,stale,{preferLocal:true}).addressBook,[]);
  assert.deepEqual(reconcileSnapshots(cloud,stale,stale).data.addressBook,[]);
  const restored={...old,id:'new'};
  assert.deepEqual(mergeSnapshots(cloud,{...stale,addressBook:[restored]}).addressBook,[restored]);
});

test('two devices changing different stops retain both deliveries and edits',()=>{
  const base={routes:[{id:'r',title:'Bursa',stops:[{id:'a',status:'pending',notes:''},{id:'b',status:'pending',notes:''}]}],addressBook:[{id:'shop',company:'Eski',address:'Bursa'}],activeId:'r'};
  const cloud={...base,routes:[{...base.routes[0],stops:[{...base.routes[0].stops[0],status:'delivered'},base.routes[0].stops[1]]}]};
  const local={...base,routes:[{...base.routes[0],stops:[base.routes[0].stops[0],{...base.routes[0].stops[1],status:'delivered',notes:'Kapıda'}]}],addressBook:[{...base.addressBook[0],company:'Yeni'}]};
  const result=reconcileSnapshots(cloud,local,base);
  assert.deepEqual(result.data.routes[0].stops.map(s=>s.status),['delivered','delivered']);
  assert.equal(result.data.routes[0].stops[1].notes,'Kapıda');
  assert.equal(result.data.addressBook[0].company,'Yeni');
  assert.deepEqual(result.conflicts,[]);
});

test('same-field conflicts keep the cloud value and report the local copy',()=>{
  const base={routes:[{id:'r',title:'Bursa',stops:[{id:'a',status:'pending'}]}],addressBook:[]};
  const cloud={...base,routes:[{...base.routes[0],title:'Bulut adı',stops:[{id:'a',status:'delivered'}]}]};
  const local={...base,routes:[{...base.routes[0],title:'Telefon adı',stops:[{id:'a',status:'failed'}]}]};
  const result=reconcileSnapshots(cloud,local,base);
  assert.equal(result.data.routes[0].title,'Bulut adı');
  assert.equal(result.data.routes[0].stops[0].status,'delivered');
  assert.ok(result.conflicts.some(x=>x.includes('title')));
  assert.ok(result.conflicts.some(x=>x.includes('status')));
});
