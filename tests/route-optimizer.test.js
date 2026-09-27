import test from 'node:test';
import assert from 'node:assert/strict';
import {optimizeStops} from '../public/route-optimizer.js';

const start={lat:40.2,lng:29.0};
const stop=(id,lng)=>({id,lat:40.2,lng});

test('shortens an open route and keeps the same stop objects',()=>{
  const stops=[stop('far',29.12),stop('near',29.01),stop('middle',29.06)];
  const result=optimizeStops(start,stops);
  assert.deepEqual(result.stops.map(s=>s.id),['near','middle','far']);
  assert.ok(result.estimatedDistanceMeters<result.originalDistanceMeters);
  assert.deepEqual(stops.map(s=>s.id),['far','near','middle']);
});

test('uses an explicit finish while keeping the final destination fixed',()=>{
  const stops=[stop('far',29.12),stop('near',29.01)];
  const finish=stop('finish',29.13);
  const result=optimizeStops(start,stops,finish);
  assert.deepEqual(result.stops.map(s=>s.id),['near','far']);
});

test('rejects a stop without a coordinate rather than changing its position',()=>{
  assert.throws(()=>optimizeStops(start,[stop('first',29.01),{id:'missing',lat:null,lng:undefined}]),/konumları gerekli/);
});
