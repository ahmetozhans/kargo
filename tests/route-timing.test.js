import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceTiming, demoLegs, estimateLocally, setTiming, timingSummary} from '../public/route-timing.js';

const at = Date.parse('2026-09-27T09:00:00Z');
const makeRoute = () => ({start:{lat:40.2,lng:29},end:null,stops:[
  {id:'a',status:'pending',lat:40.2,lng:29.01},
  {id:'b',status:'pending',lat:40.2,lng:29.02},
  {id:'c',status:'pending',lat:40.2,lng:29.03}
]});
const legs = [
  {durationSeconds:600,distanceMeters:3000},
  {durationSeconds:900,distanceMeters:4000},
  {durationSeconds:1200,distanceMeters:5000}
];

test('delivering the next stop selects the next one and rebases its arrival without another route request', () => {
  const route=makeRoute();
  setTiming(route,legs,'google',at);
  assert.equal(timingSummary(route,at).arrivals.get('b'),at+1500_000);
  route.stops[0].status='delivered';
  assert.equal(advanceTiming(route,'a','a',at+11*60_000),'b');
  const summary=timingSummary(route,at+11*60_000);
  assert.equal(summary.arrivals.get('b'),at+26*60_000);
  assert.equal(route.durationSeconds,2100);
  assert.equal(route.distanceMeters,9000);
  assert.equal(summary.remainingSeconds,2100);
});

test('a stop completed out of order advances to the first pending stop and clears invalid estimates', () => {
  const route=makeRoute();
  setTiming(route,legs,'google',at);
  route.stops[1].status='skipped';
  assert.equal(advanceTiming(route,'a','b',at+60_000),'a');
  assert.equal(timingSummary(route),null);
  assert.equal(route.distanceMeters,null);
});

test('completing the final stop leaves no next selection', () => {
  const route=makeRoute();
  route.stops=route.stops.slice(0,1);
  setTiming(route,legs.slice(0,1),'google',at);
  route.stops[0].status='delivered';
  assert.equal(advanceTiming(route,'a','a',at+600_000),null);
  assert.equal(timingSummary(route),null);
});

test('demo estimates can be calculated without a network request', () => {
  const route=makeRoute();
  setTiming(route,demoLegs(route),'demo',at);
  assert.equal(timingSummary(route,at).arrivals.size,3);
  assert.ok(route.durationSeconds>0);
  assert.equal(route.timingSource,'demo');
});

test('a route with an end point includes the final return leg', () => {
  const route=makeRoute();
  route.end={lat:40.2,lng:29.04};
  setTiming(route,[...legs,{durationSeconds:300,distanceMeters:1000}],'google',at);
  assert.equal(timingSummary(route,at).finishAt,at+3000_000);
  route.stops[0].status='delivered';
  advanceTiming(route,'a','a',at+600_000);
  assert.equal(route.durationSeconds,2400);
});

test('after the final delivery, the return remains the last destination with an arrival time',()=>{
  const route=makeRoute();
  route.stops=route.stops.slice(0,1);
  route.end={lat:40.2,lng:29.04,address:'Nilüfer Ticaret Merkezi'};
  setTiming(route,[legs[0],{durationSeconds:360,distanceMeters:2000}],'google',at);
  route.stops[0].status='delivered';
  assert.equal(advanceTiming(route,'a','a',at+600_000),null);
  const summary=timingSummary(route,at+600_000);
  assert.equal(summary.finishAt,at+960_000);
  assert.equal(route.durationSeconds,360);
  assert.equal(route.timingSource,'google');
});

test('existing completed deliveries can estimate their return without a new Google request',()=>{
  const route=makeRoute();
  route.stops[0].status='delivered';
  route.stops=route.stops.slice(0,1);
  route.end={lat:40.2,lng:29.04};
  assert.equal(estimateLocally(route,at),true);
  assert.ok(timingSummary(route,at).finishAt>at);
});

test('new or reordered stops show a local time immediately while old road geometry is removed',()=>{
  const route=makeRoute();
  setTiming(route,legs,'google',at);
  route.encodedPolyline='old-google-road';
  [route.stops[0],route.stops[2]]=[route.stops[2],route.stops[0]];
  assert.equal(estimateLocally(route,at),true);
  assert.equal(route.encodedPolyline,null);
  assert.equal(timingSummary(route,at).arrivals.size,3);
  assert.equal(route.timingSource,'local');
});

test('a stop without a location never produces a misleading arrival',()=>{
  const route=makeRoute();
  route.stops[0].lat=null;
  assert.equal(estimateLocally(route,at),false);
  assert.equal(timingSummary(route),null);
});
