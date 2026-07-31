type LonLat = [number, number];

function avg(points: LonLat[]): LonLat | null {
  if (points.length === 0) return null;
  let lng = 0;
  let lat = 0;
  for (const [x, y] of points) {
    lng += x;
    lat += y;
  }
  return [lng / points.length, lat / points.length];
}

function ringCentroid(ring: LonLat[]): LonLat | null {
  if (ring.length < 3) return avg(ring);
  // Shoelace centroid for the outer ring.
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i]!;
    const [x1, y1] = ring[i + 1]!;
    const a = x0 * y1 - x1 * y0;
    area += a;
    cx += (x0 + x1) * a;
    cy += (y0 + y1) * a;
  }
  if (Math.abs(area) < 1e-12) return avg(ring);
  area *= 0.5;
  return [cx / (6 * area), cy / (6 * area)];
}

/**
 * Extract a representative [lng, lat] from Toronto open-data geometry JSON
 * (Point / MultiPoint / Polygon / MultiPolygon).
 */
export function geometryCentroid(geometryRaw: string): { lat: number; lng: number } | null {
  let geometry: {
    type?: string;
    coordinates?: unknown;
  };
  try {
    geometry = JSON.parse(geometryRaw) as typeof geometry;
  } catch {
    return null;
  }
  const type = geometry.type;
  const coords = geometry.coordinates;
  if (!type || coords == null) return null;

  let pair: LonLat | null = null;
  switch (type) {
    case "Point":
      pair = coords as LonLat;
      break;
    case "MultiPoint": {
      const pts = coords as LonLat[];
      pair = avg(pts);
      break;
    }
    case "Polygon": {
      const rings = coords as LonLat[][];
      pair = ringCentroid(rings[0] ?? []);
      break;
    }
    case "MultiPolygon": {
      const polys = coords as LonLat[][][];
      pair = ringCentroid(polys[0]?.[0] ?? []);
      break;
    }
    default:
      return null;
  }

  if (!pair) return null;
  const [lng, lat] = pair;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export function titleCaseName(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return trimmed;
  // Keep short all-caps acronyms; otherwise soften SCREAMING CASE.
  if (trimmed === trimmed.toUpperCase() && trimmed.length > 3) {
    return trimmed
      .toLowerCase()
      .replace(/\b([a-z])/g, (m) => m.toUpperCase())
      .replace(/\b(Ps|Ss|Ci|Tdsb|Tcdsb|Go)\b/g, (m) => m.toUpperCase());
  }
  return trimmed;
}
