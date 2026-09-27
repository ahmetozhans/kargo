import test from 'node:test';
import assert from 'node:assert/strict';
import {approximateDriveSeconds,mapsDirectionsUrl,routeProgress} from '../public/navigation.js';

test('Google Maps link opens navigation from current location without an empty place ID',()=>{
  const url=new URL(mapsDirectionsUrl({lat:40.2,lng:29.05}));
  assert.equal(url.searchParams.get('dir_action'),'navigate');
  assert.equal(url.searchParams.get('destination'),'40.2,29.05');
  assert.equal(url.searchParams.has('destination_place_id'),false);
  assert.equal(url.searchParams.has('origin'),false);
});

test('route tracking updates remaining road distance as GPS moves',()=>{
  const path=[{lat:40.2,lng:29},{lat:40.2,lng:29.01},{lat:40.2,lng:29.02}];
  const start=routeProgress({lat:40.2,lng:29.001},path,2500,600);
  const later=routeProgress({lat:40.2,lng:29.015},path,2500,600);
  assert.ok(start.remainingMeters>later.remainingMeters);
  assert.ok(start.remainingSeconds>later.remainingSeconds);
  assert.ok(start.offRouteMeters<10);
  assert.ok(routeProgress({lat:40.21,lng:29.015},path,2500,600).offRouteMeters>80);
});

test('when road directions are unavailable a distance-based driving estimate is available',()=>{
  assert.ok(approximateDriveSeconds(3500)>0);
  assert.equal(approximateDriveSeconds(null),null);
});
