import {distanceMeters} from './route-optimizer.js';

export function mapsDirectionsUrl(stop) {
  if (!stop || !Number.isFinite(Number(stop.lat)) || !Number.isFinite(Number(stop.lng))) return null;
  const url = new URL('https://www.google.com/maps/dir/');
  url.searchParams.set('api','1');
  url.searchParams.set('destination',`${stop.lat},${stop.lng}`);
  if (stop.placeId) url.searchParams.set('destination_place_id',stop.placeId);
  url.searchParams.set('travelmode','driving');
  url.searchParams.set('dir_action','navigate');
  return url.href;
}

export function directDistance(position, destination) {
  if (!position || !destination) return null;
  const distance=distanceMeters(position,destination);
  return Number.isFinite(distance) ? distance : null;
}

export function approximateDriveSeconds(meters) {
  return meters == null || !Number.isFinite(meters) ? null : Math.max(0, Math.ceil(meters * 1.35 / (30000 / 3600)));
}

// Snap the current position to the closest segment of the planned road shape.
export function routeProgress(position, points, roadMeters, durationSeconds) {
  if (!position || !Array.isArray(points) || points.length < 2) return null;
  const toXY=p=>({x:p.lng*111320*Math.cos(position.lat*Math.PI/180),y:p.lat*111320});
  const current=toXY(position),coords=points.map(toXY);
  let total=0,best=null;
  for(let i=0;i<coords.length-1;i++){
    const a=coords[i],b=coords[i+1],dx=b.x-a.x,dy=b.y-a.y;
    const length=Math.hypot(dx,dy);
    const t=length?Math.max(0,Math.min(1,((current.x-a.x)*dx+(current.y-a.y)*dy)/(length*length))):0;
    const gap=Math.hypot(current.x-a.x-t*dx,current.y-a.y-t*dy);
    if(!best||gap<best.gap)best={gap,along:total+length*t};
    total+=length;
  }
  if(!best||!total)return null;
  const fraction=Math.max(0,Math.min(1,(total-best.along)/total));
  return {offRouteMeters:Math.round(best.gap),remainingMeters:Math.round(fraction*roadMeters),remainingSeconds:Math.ceil(fraction*durationSeconds)};
}
