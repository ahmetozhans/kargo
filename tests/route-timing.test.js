import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceTiming, demoLegs, setTiming, timingSummary} from '../public/route-timing.js';

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
