import test from 'node:test';
import assert from 'node:assert/strict';
import {routeTransitionError} from '../api/route-guard.js';

const route=(id,finishedAt=null,stops=[])=>({id,finishedAt,stops});

test('a new route needs every previous route finished, including legacy routes',()=>{
  const before={routes:[route('old'),route('legacy')]};
  assert.equal(routeTransitionError(before,{routes:[...before.routes,route('new')]}).code,'ACTIVE_ROUTE_EXISTS');
  assert.equal(routeTransitionError(before,{routes:[route('old'),route('legacy')]}),null);
  assert.equal(routeTransitionError(before,{routes:[route('old',1),route('legacy',1),route('new')]}),null);
  assert.equal(routeTransitionError(before,{routes:[route('new')]}).code,'ACTIVE_ROUTE_EXISTS');
  assert.equal(routeTransitionError(null,{routes:[route('first'),route('second')]}).code,'ACTIVE_ROUTE_EXISTS');
});

test('a route with pending stops cannot be finished to unlock a new route',()=>{
  const before={routes:[route('old',null,[{id:'a',status:'pending'}])]};
  assert.equal(routeTransitionError(before,{routes:[route('old','today',[{id:'a',status:'pending'}]),route('new')]}).code,'ROUTE_HAS_PENDING_STOPS');
  assert.equal(routeTransitionError(before,{routes:[route('old','today',[{id:'a',status:'delivered'}]),route('new')]}),null);
});

test('a completed route is immutable and a return requires arrival confirmation',()=>{
  const archived=route('archive','yesterday',[{id:'x',status:'delivered'}]);
  assert.equal(routeTransitionError({routes:[archived]},{routes:[{...archived,stops:[]}]}).code,'FINISHED_ROUTE_LOCKED');
  const active={...route('active',null,[{id:'s',status:'delivered'}]),end:{address:'Depo',lat:40,lng:29}};
  const finished={...active,finishedAt:'today'};
  assert.equal(routeTransitionError({routes:[active]},{routes:[finished]}).code,'RETURN_NOT_REACHED');
  assert.equal(routeTransitionError({routes:[active]},{routes:[{...finished,returnReachedAt:'today'}]}),null);
});
