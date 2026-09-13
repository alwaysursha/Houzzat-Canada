/**
 * Search overlay Share menu opens downward; listing cards stay upward.
 * Run: pnpm exec tsx scripts/listing-share-menu-placement-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const actions = read("src/components/listings/ListingCardActions.tsx");
  assert.ok(actions.includes('shareMenuPlacement = "up"'));
  assert.ok(actions.includes('shareMenuPlacement?: "up" | "down"'));
  assert.ok(actions.includes('case "up":'));
  assert.ok(actions.includes('return "bottom-full mb-2"'));
  assert.ok(actions.includes('case "down":'));
  assert.ok(actions.includes('return "top-full mt-2"'));
  assert.ok(actions.includes("const _exhaustive: never = placement"));
  assert.ok(
    !actions.includes('className="absolute left-0 bottom-full'),
    "placement must come from shareMenuPlacement, not a hardcoded upward menu",
  );

  const card = read("src/components/listings/ListingCard.tsx");
  assert.ok(card.includes("<ListingCardActions"));
  assert.ok(
    !card.includes("shareMenuPlacement"),
    "listing cards must keep the default upward Share menu",
  );

  const overlay = read("src/components/listings/SearchMapListingOverlay.tsx");
  assert.ok(overlay.includes('shareMenuPlacement="down"'));
  console.log("listing-share-menu-placement-selftest: ok");
}

main();
