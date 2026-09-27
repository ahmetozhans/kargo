import test from 'node:test';
import assert from 'node:assert/strict';
import {hasLocalOnly,mergeSnapshots} from '../public/sync-merge.js';

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
