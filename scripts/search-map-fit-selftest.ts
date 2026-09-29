/**
 * Map auto-fit uses known city centers, otherwise listing coordinates, once per place.
 * Run: node --import tsx scripts/search-map-fit-selftest.ts
 */
import assert from "node:assert/strict";
import {
  listingResultFrame,
  searchMapCentroidFrame,
  searchMapGeographyKey,
  searchMapNeedsResultFit,
} from "../src/lib/geo/search-map-fit";

const empty = {
  city: "",
  community: "",
  cities: "",
  communities: "",
  q: "",
};

assert.equal(searchMapGeographyKey(empty), "");

const qKitchener = searchMapCentroidFrame({ ...empty, q: "kitchener" });
assert.equal(qKitchener?.kind, "center");
if (qKitchener?.kind === "center") {
  assert.ok(Math.abs(qKitchener.lat - 43.4516) < 0.01);
  assert.ok(Math.abs(qKitchener.lng - -80.4925) < 0.01);
  assert.equal(qKitchener.zoom, 11);
}
assert.equal(searchMapNeedsResultFit({ ...empty, q: "kitchener" }), false);

const qStreet = { ...empty, q: "79 Grand Ave" };
assert.equal(searchMapCentroidFrame(qStreet), null);
assert.equal(searchMapNeedsResultFit(qStreet), true);

const city = searchMapCentroidFrame({ ...empty, city: "Waterloo" });
assert.equal(city?.kind, "center");
assert.equal(searchMapNeedsResultFit({ ...empty, city: "Waterloo" }), false);

const neighbourhood = {
  ...empty,
  city: "Kitchener",
  community: "Doon",
};
assert.equal(searchMapCentroidFrame(neighbourhood)?.kind, "center");
assert.equal(searchMapNeedsResultFit(neighbourhood), true);

const multi = searchMapCentroidFrame({
  ...empty,
  cities: "Kitchener|Waterloo",
});
assert.equal(multi?.kind, "bounds");
if (multi?.kind === "bounds") {
  assert.ok(multi.west < -80.49);
  assert.ok(multi.east > -80.5);
  assert.equal(multi.maxZoom, 11);
}
assert.equal(
  searchMapNeedsResultFit({ ...empty, cities: "Kitchener|Waterloo" }),
  false,
);

assert.equal(
  searchMapGeographyKey({ ...empty, city: "Kitchener" }),
  searchMapGeographyKey({ ...empty, city: "Kitchener" }),
);
assert.notEqual(
  searchMapGeographyKey({ ...empty, city: "Kitchener" }),
  searchMapGeographyKey({ ...empty, city: "Waterloo" }),
);
assert.equal(
  searchMapGeographyKey({ ...empty, city: "Kitchener" }),
  searchMapGeographyKey({ ...empty, city: "Kitchener" }),
);

const one = listingResultFrame([{ lat: 43.45, lng: -80.49 }]);
assert.equal(one?.kind, "center");
if (one?.kind === "center") assert.equal(one.zoom, 13);

const many = listingResultFrame([
  { lat: 43.44, lng: -80.51 },
  { lat: 43.47, lng: -80.46 },
]);
assert.equal(many?.kind, "bounds");
if (many?.kind === "bounds") assert.equal(many.maxZoom, 13);

assert.equal(listingResultFrame([{ lat: 0, lng: 0 }]), null);

assert.equal(searchMapNeedsResultFit({ ...empty, q: "MLS123" }), true);
assert.equal(searchMapCentroidFrame({ ...empty, q: "MLS123" }), null);

console.log("search-map-fit-selftest: ok");
