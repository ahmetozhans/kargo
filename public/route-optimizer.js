const radians = value => value * Math.PI / 180;

export function distanceMeters(a, b) {
  const lat1 = radians(Number(a.lat));
  const lat2 = radians(Number(b.lat));
  const deltaLat = lat2 - lat1;
  const deltaLng = radians(Number(b.lng) - Number(a.lng));
  const half = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 12742000 * Math.asin(Math.min(1, Math.sqrt(half)));
}

function length(start, stops, end) {
  let total = 0;
  let previous = start;
  for (const stop of stops) {
    total += distanceMeters(previous, stop);
    previous = stop;
  }
  if (end) total += distanceMeters(previous, end);
  return total;
}

function nearestFirst(start, stops, end) {
  const remaining = [...stops];
  const ordered = [];
  let previous = start;
  while (remaining.length) {
    let best = 0;
    let bestScore = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const score = distanceMeters(previous, remaining[i]) + (end ? distanceMeters(remaining[i], end) * 0.25 : 0);
      if (score < bestScore) { best = i; bestScore = score; }
    }
    const [selected] = remaining.splice(best, 1);
    ordered.push(selected);
    previous = selected;
  }
  return ordered;
}

function improve(start, seed, end) {
  let best = [...seed];
  let bestLength = length(start, best, end);
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const candidate = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)];
        const candidateLength = length(start, candidate, end);
        if (candidateLength + 0.01 < bestLength) {
          best = candidate;
          bestLength = candidateLength;
          changed = true;
        }
      }
    }
  }
  return {stops: best, distanceMeters: bestLength};
}

// This is a coordinate-based suggestion. Google Routes is needed for road distance and ETA.
export function optimizeStops(start, stops, end = null) {
  const valid = point => point && point.lat != null && point.lng != null && Number.isFinite(+point.lat) && Number.isFinite(+point.lng);
  if (!valid(start) || end && !valid(end) || !Array.isArray(stops) || stops.some(stop => !valid(stop))) {
    throw new Error('Optimizasyon için durak konumları gerekli.');
  }
  const originalDistanceMeters = length(start, stops, end);
  if (stops.length < 2) return {stops: [...stops], originalDistanceMeters, estimatedDistanceMeters: originalDistanceMeters};
  const original = improve(start, stops, end);
  const greedy = improve(start, nearestFirst(start, stops, end), end);
  const winner = greedy.distanceMeters < original.distanceMeters ? greedy : original;
  return {stops: winner.stops, originalDistanceMeters, estimatedDistanceMeters: winner.distanceMeters};
}
