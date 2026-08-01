import type { StyleSpecification } from "maplibre-gl";

/**
 * Raster basemap for MapLibre.
 *
 * Do NOT use tile.openstreetmap.org directly — OSMF blocks bulk browser
 * usage (x-blocked) and rejects zoom > 19, which surfaces as MapLibre
 * AJAXError overlays. CARTO hosts OSM-derived tiles for app use.
 */
export const OSM_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
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

/** Cap interactive zoom so we stay within reliable raster coverage. */
export const MAP_MAX_ZOOM = 18;
export const MAP_MIN_ZOOM = 3;
