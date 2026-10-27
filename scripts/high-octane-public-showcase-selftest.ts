/**
 * HIGH OCTANE public showcase. No database connection.
 * Run: pnpm exec tsx scripts/high-octane-public-showcase-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  HIGH_OCTANE_DEMO_CARD_LABEL,
  HIGH_OCTANE_DEMO_PROPERTY_NOTICE,
  decideHighOctanePublicShowcase,
} from "../src/lib/tenancy/templates/high-octane-public-showcase";
import {
  decideHighOctaneDevelopmentListingAccess,
  highOctaneDevelopmentListingBadge,
  highOctaneDevelopmentListingDetail,
  highOctaneDevelopmentListingsEnabled,
  searchHighOctaneDevelopmentListings,
} from "../src/lib/tenancy/templates/high-octane-development-listings";
import { HIGH_OCTANE_STAGING_WORKSPACE_SLUG } from "../src/lib/tenancy/templates/high-octane-staging-slug";
import { takeRoyalFeaturedListings } from "../src/components/templates/royal-collection-one/royal-featured-listings";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const slug = HIGH_OCTANE_STAGING_WORKSPACE_SLUG;

const productionEnv = {
  NODE_ENV: "production",
  VERCEL_ENV: "production",
  HIGH_OCTANE_DEVELOPMENT_LISTINGS: "on",
  HIGH_OCTANE_PUBLIC_SHOWCASE: "on",
  ALLOW_DEMO_LISTINGS: "on",
};

assert.equal(highOctaneDevelopmentListingsEnabled(productionEnv), false);
assert.equal(
  decideHighOctaneDevelopmentListingAccess({
    env: productionEnv,
    workspaceSlug: slug,
    actor: {
      email: "teamalisyed@gmail.com",
      masterAdminActive: true,
      highOctaneMembershipActive: true,
    },
  }).serveFixtures,
  false,
);

const showcase = decideHighOctanePublicShowcase({
  workspaceSlug: slug,
  authorities: [],
});
assert.equal(showcase.serve, true);
assert.equal(showcase.ownActiveListings, false);

assert.equal(
  decideHighOctanePublicShowcase({
    workspaceSlug: "houzzat",
    authorities: [],
  }).serve,
  false,
);
assert.equal(
  decideHighOctanePublicShowcase({
    workspaceSlug: null,
    authorities: [],
  }).serve,
  false,
);
assert.equal(
  decideHighOctanePublicShowcase({
    workspaceSlug: slug,
    authorities: [
      {
        organizationId: "org",
        providerKey: "proptx",
        sourceAuthorityKey: "org:proptx",
        capabilities: ["ACTIVE_LISTINGS"],
      },
    ],
  }).serve,
  false,
);

const all = searchHighOctaneDevelopmentListings({});
assert.equal(all.length, 14);
assert.equal(all[0]?.mlsNumber, "ITSODEMO1001");
assert.equal(all.every((card) => card.isMock), true);
assert.equal(all.every((card) => card.organizationId == null), true);
assert.equal(all.every((card) => Number.isFinite(card.lat) && Number.isFinite(card.lng)), true);

const featured = takeRoyalFeaturedListings(all);
assert.equal(featured.length, 6);
assert.equal(
  featured.every((card) => highOctaneDevelopmentListingBadge(card.dataSource) === HIGH_OCTANE_DEMO_CARD_LABEL),
  true,
);
assert.equal(
  takeRoyalFeaturedListings([
    { ...all[0]!, dataSource: "mls", mlsNumber: "X100" },
    { ...all[1]!, dataSource: "mls", mlsNumber: "X101" },
    { ...all[2]!, dataSource: "mls", mlsNumber: "X102" },
    { ...all[3]!, dataSource: "mls", mlsNumber: "X103" },
  ]).length,
  3,
);

const detail = highOctaneDevelopmentListingDetail("ITSODEMO1001");
assert.ok(detail);
assert.equal(detail.media.length, 5);
assert.equal(detail.description?.includes("DEMO PROPERTY"), true);
assert.equal(HIGH_OCTANE_DEMO_PROPERTY_NOTICE.includes("not available for purchase or viewing"), true);

const leads = readFileSync(join(root, "src/app/api/leads/route.ts"), "utf8");
const guardAt = leads.indexOf("if (isHighOctaneDevelopmentListingMls(data.mlsNumber))");
const createAt = leads.indexOf("await publicResolveOrCreateLead");
assert.ok(guardAt > 0 && createAt > guardAt);

const sitemap = readFileSync(join(root, "src/app/sitemap.ts"), "utf8");
assert.equal(sitemap.includes('startsWith: "ITSODEMO"'), true);

const gallery = readFileSync(
  join(root, "src/app/api/listings/[mlsNumber]/gallery/route.ts"),
  "utf8",
);
assert.ok(
  gallery.indexOf("if (isHighOctaneDevelopmentListingMls(raw))") <
    gallery.indexOf("fetchListingPhotosFromPropTx("),
);
assert.equal(gallery.includes("decideHighOctanePublicShowcase"), true);

const detailRoute = readFileSync(
  join(root, "src/app/(marketing)/listing/[...parts]/listing-operational.tsx"),
  "utf8",
);
assert.equal(detailRoute.includes("noindex"), false);
assert.equal(detailRoute.includes("index: false, follow: false"), true);
assert.equal(detailRoute.includes("decideHighOctanePublicShowcase"), true);
assert.equal(detailRoute.includes("listingView.create"), true);

const development = readFileSync(
  join(root, "src/lib/tenancy/templates/high-octane-development-listings.ts"),
  "utf8",
);
assert.equal(development.includes('env.NODE_ENV === "production"'), true);
assert.equal(development.includes("HIGH_OCTANE_PUBLIC_SHOWCASE"), false);

console.log("high-octane-public-showcase-selftest: ok");
