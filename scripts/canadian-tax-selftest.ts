import assert from "node:assert/strict";
import {
  quoteCommercialTax,
  refundTaxCents,
  taxCentsOnExclusiveAmount,
} from "../src/lib/platform/billing/canadian-tax";

const ontario = quoteCommercialTax({
  country: "CA",
  region: "ON",
  recurringNetCents: 29_900,
  oneTimeNetCents: 25_000,
});
assert.equal(ontario.label, "HST");
assert.equal(ontario.rateBps, 1_300);
assert.equal(ontario.subtotalCents, 54_900);
assert.equal(ontario.taxCents, 7_137);
assert.equal(ontario.firstGrossCents, 62_037);
assert.equal(ontario.recurringTaxCents, 3_887);
assert.equal(ontario.recurringGrossCents, 33_787);
assert.equal(ontario.oneTimeTaxCents, 3_250);

const catalogIsNotTaxed = quoteCommercialTax({
  country: "CA",
  region: "ON",
  recurringNetCents: 29_900,
  oneTimeNetCents: 0,
});
assert.notEqual(catalogIsNotTaxed.recurringTaxCents, taxCentsOnExclusiveAmount(59_900, 1_300));

const britishColumbia = quoteCommercialTax({
  country: "CA",
  region: "BC",
  recurringNetCents: 29_900,
  oneTimeNetCents: 25_000,
});
assert.equal(britishColumbia.label, "GST");
assert.equal(britishColumbia.rateBps, 500);
assert.equal(britishColumbia.taxCents, 2_745);

const novaScotia = quoteCommercialTax({
  country: "CA",
  region: "NS",
  recurringNetCents: 10_000,
  oneTimeNetCents: 0,
});
assert.equal(novaScotia.rateBps, 1_400);
assert.equal(novaScotia.taxCents, 1_400);

const exported = quoteCommercialTax({
  country: "US",
  region: null,
  recurringNetCents: 29_900,
  oneTimeNetCents: 25_000,
});
assert.equal(exported.treatment, "zero_rated");
assert.equal(exported.taxCents, 0);
assert.equal(exported.firstGrossCents, 54_900);

const exempt = quoteCommercialTax({
  country: "CA",
  region: "ON",
  taxExempt: true,
  recurringNetCents: 29_900,
  oneTimeNetCents: 25_000,
});
assert.equal(exempt.treatment, "exempt");
assert.equal(exempt.taxCents, 0);

const missing = quoteCommercialTax({
  country: "CA",
  region: null,
  recurringNetCents: 29_900,
  oneTimeNetCents: 0,
});
assert.equal(missing.treatment, "location_required");
assert.equal(missing.taxCents, 0);

assert.equal(
  refundTaxCents({ refundCents: 62_037, grossCents: 62_037, taxCents: 7_137 }),
  7_137,
);
assert.equal(
  refundTaxCents({ refundCents: 31_019, grossCents: 62_037, taxCents: 7_137 }),
  3_569,
);

console.log("canadian-tax-selftest: ok");
