import {distanceMeters} from './route-optimizer.js';

const remaining = route => route.stops.filter(stop => stop.status === 'pending');

export function clearTiming(route) {
  route.distanceMeters = null;
  route.durationSeconds = null;
  route.encodedPolyline = null;
  delete route.timingAnchorAt;
  delete route.timingSource;
  delete route.endLegSeconds;
  delete route.endLegMeters;
  route.stops.forEach(stop => {
    delete stop.eta;
    delete stop.legSeconds;
    delete stop.legMeters;
  });
}

export function demoLegs(route) {
  const stops = remaining(route);
  let previous = route.stops.filter(stop => stop.status !== 'pending').at(-1) || route.start;
  const legs = stops.map(stop => {
    const distance = distanceMeters(previous, stop);
    previous = stop;
    // A rough coordinate-only preview: 1.35x straight line at 30 km/h.
    return {distanceMeters: Math.round(distance * 1.35), durationSeconds: Math.max(60, Math.round(distance * 1.35 / (30000 / 3600)))};
  });
  if (route.end) {
    const distance = distanceMeters(previous, route.end);
    legs.push({distanceMeters: Math.round(distance * 1.35), durationSeconds: Math.max(60, Math.round(distance * 1.35 / (30000 / 3600)))});
  }
  return legs;
}

export function setTiming(route, legs, source, at = Date.now()) {
  const stops = remaining(route);
  if (!Array.isArray(legs) || legs.length !== stops.length + (route.end ? 1 : 0) ||
      legs.some(leg => !Number.isFinite(leg.durationSeconds) || leg.durationSeconds < 0 ||
        !Number.isFinite(leg.distanceMeters) || leg.distanceMeters < 0)) {
    throw new Error('Rota süreleri alınamadı. Tekrar hesaplamayı dene.');
  }
  stops.forEach((stop, index) => {
    stop.legSeconds = legs[index].durationSeconds;
    stop.legMeters = legs[index].distanceMeters;
    delete stop.eta;
  });
  const lastLeg = route.end ? legs.at(-1) : null;
  route.endLegSeconds = lastLeg?.durationSeconds || 0;
  route.endLegMeters = lastLeg?.distanceMeters || 0;
  route.timingAnchorAt = new Date(at).toISOString();
  route.timingSource = source;
  route.durationSeconds = legs.reduce((sum, leg) => sum + leg.durationSeconds, 0);
  route.distanceMeters = legs.reduce((sum, leg) => sum + leg.distanceMeters, 0);
}

export function timingSummary(route, now = Date.now()) {
  const stops = remaining(route);
  const anchor = Date.parse(route.timingAnchorAt);
  if (!Number.isFinite(anchor) || !stops.length || stops.some(stop => !Number.isFinite(stop.legSeconds))) return null;
  let elapsed = 0;
  const arrivals = new Map();
  for (const stop of stops) {
    elapsed += stop.legSeconds;
    arrivals.set(stop.id, anchor + elapsed * 1000);
  }
  const finishAt = anchor + (elapsed + (route.endLegSeconds || 0)) * 1000;
  return {arrivals, finishAt, remainingSeconds: Math.max(0, Math.ceil((finishAt - now) / 1000)), source: route.timingSource};
}

export function advanceTiming(route, firstPendingId, completedId, at = Date.now()) {
  const next = remaining(route)[0];
  if (!next) {
    clearTiming(route);
    return null;
  }
  if (firstPendingId !== completedId || !route.timingAnchorAt ||
      remaining(route).some(stop => !Number.isFinite(stop.legSeconds))) {
    clearTiming(route);
    return next.id;
  }
  route.timingAnchorAt = new Date(at).toISOString();
  route.encodedPolyline = null;
  const left = remaining(route);
  route.durationSeconds = left.reduce((sum, stop) => sum + stop.legSeconds, route.endLegSeconds || 0);
  route.distanceMeters = left.reduce((sum, stop) => sum + stop.legMeters, route.endLegMeters || 0);
  return next.id;
}
