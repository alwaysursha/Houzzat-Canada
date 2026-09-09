import type { StyleSpecification } from "maplibre-gl";

/**
 * Raster CARTO Voyager used to be free without a key. As of late Aug 2026
 * CARTO watermarks those tiles with "API KEY REQUIRED" unless `?key=` is set.
 * Request a key at https://carto.com/basemaps/apikey (fair-use / domain).
 *
 * Do NOT use tile.openstreetmap.org — OSMF blocks bulk browser usage.
 * Default: OpenFreeMap vector (OSM, no key). Voyager if NEXT_PUBLIC_CARTO_API_KEY is set.
 */
const CARTO_KEY = process.env.NEXT_PUBLIC_CARTO_API_KEY?.trim() ?? "";

function cartoVoyagerStyle(key: string): StyleSpecification {
  const q = `?key=${encodeURIComponent(key)}`;
  return {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: [
          `https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png${q}`,
          `https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png${q}`,
          `https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png${q}`,
        ],
        tileSize: 256,
        maxzoom: 20,
        attribution: "© OpenStreetMap © CARTO",
      },
    },
    layers: [
      {
        id: "osm",
        type: "raster",
        source: "osm",
      },
    ],
  };
}

/** OpenFreeMap Liberty — MapLibre vector style, no API key. */
export const OPENFREEMAP_STYLE_URL =
  "https://tiles.openfreemap.org/styles/liberty";

export const OSM_STYLE: StyleSpecification | string = CARTO_KEY
  ? cartoVoyagerStyle(CARTO_KEY)
  : OPENFREEMAP_STYLE_URL;

/** Cap interactive zoom so we stay within reliable raster/vector coverage. */
export const MAP_MAX_ZOOM = 18;
export const MAP_MIN_ZOOM = 3;
