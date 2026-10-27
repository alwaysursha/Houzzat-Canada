/**
 * HIGH OCTANE PropTx source choice. No database and no credentials.
 * Run: pnpm exec tsx scripts/high-octane-proptx-source-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decideHighOctaneDevelopmentListingAccess } from "../src/lib/tenancy/templates/high-octane-development-listings";
import { HIGH_OCTANE_STAGING_WORKSPACE_SLUG } from "../src/lib/tenancy/templates/high-octane-staging-slug";
import {
  activateHighOctaneListingSourceRequest,
  evaluateHighOctanePropTxSource,
  fixtureRequestForStoredSource,
  parseStoredHighOctaneListingSource,
  type HighOctanePropTxReadiness,
} from "../src/lib/tenancy/templates/high-octane-proptx-source";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceId = "ws-high-octane";

function ready(overrides: Partial<HighOctanePropTxReadiness> = {}): HighOctanePropTxReadiness {
  return {
    workspaceId,
    connection: {
      workspaceId,
      providerKey: "proptx",
      organizationSlug: "ca-on-trreb",
      status: "ACTIVE",
      credentialRefPresent: true,
      capabilities: ["ACTIVE_LISTINGS"],
    },
    membershipStatus: "VERIFIED",
    primaryDomainActive: true,
    idxWebsiteApproved: true,
    vowApproved: false,
    ...overrides,
  };
}

const missing = evaluateHighOctanePropTxSource("idx", {
  ...ready(),
  connection: null,
});
assert.equal(missing.available, false);
assert.equal(missing.trrebBorrowAuthorized, false);
assert.equal(missing.providerKey, "proptx");
assert.match(missing.blockers[0] ?? "", /Houzzat's TRREB credentials are not shared/);

const borrowed = evaluateHighOctanePropTxSource(
  "idx",
  ready({
    connection: {
      workspaceId: "ws-houzzat",
      providerKey: "proptx",
      organizationSlug: "ca-on-trreb",
      status: "ACTIVE",
      credentialRefPresent: true,
      capabilities: ["ACTIVE_LISTINGS"],
    },
  }),
);
assert.equal(borrowed.available, false);
assert.match(borrowed.blockers[0] ?? "", /another workspace/);

const noToken = evaluateHighOctanePropTxSource(
  "idx",
  ready({
    connection: {
      workspaceId,
      providerKey: "proptx",
      organizationSlug: "ca-on-trreb",
      status: "ACTIVE",
      credentialRefPresent: false,
      capabilities: ["ACTIVE_LISTINGS"],
    },
  }),
);
assert.equal(noToken.available, false);
assert.match(noToken.blockers.join(" "), /subscription does not enable API access/);

const idxReady = evaluateHighOctanePropTxSource("idx", ready());
assert.equal(idxReady.available, true);
assert.equal(idxReady.trrebBorrowAuthorized, false);

const vowWithoutAgreement = evaluateHighOctanePropTxSource("vow", ready());
assert.equal(vowWithoutAgreement.available, false);
assert.match(vowWithoutAgreement.blockers.join(" "), /IDX approval does not include VOW/);

const vowReady = evaluateHighOctanePropTxSource("vow", ready({ vowApproved: true }));
assert.equal(vowReady.available, true);

const itsoShaped = evaluateHighOctanePropTxSource(
  "idx",
  ready({
    connection: {
      workspaceId,
      providerKey: "itso",
      organizationSlug: "ca-on-trreb",
      status: "ACTIVE",
      credentialRefPresent: true,
      capabilities: ["ACTIVE_LISTINGS"],
    },
  }),
);
assert.equal(itsoShaped.available, false);
assert.match(itsoShaped.blockers.join(" "), /PropTx provider/);

assert.equal(parseStoredHighOctaneListingSource("live"), "retired-itso-live");
assert.equal(fixtureRequestForStoredSource("proptx-idx"), "disabled");
assert.equal(fixtureRequestForStoredSource("proptx-vow"), "disabled");
assert.equal(fixtureRequestForStoredSource("retired-itso-live"), "disabled");
assert.equal(fixtureRequestForStoredSource("demo"), "demo");
assert.equal(fixtureRequestForStoredSource(null), null);

const master = {
  email: "teamalisyed@gmail.com",
  masterAdminActive: true,
  highOctaneMembershipActive: false,
};
assert.equal(
  decideHighOctaneDevelopmentListingAccess({
    env: { NODE_ENV: "development", HIGH_OCTANE_DEVELOPMENT_LISTINGS: "on" },
    workspaceSlug: HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
    actor: master,
    requested: fixtureRequestForStoredSource("proptx-idx"),
  }).serveFixtures,
  false,
);
assert.equal(
  decideHighOctaneDevelopmentListingAccess({
    env: { NODE_ENV: "production", HIGH_OCTANE_DEVELOPMENT_LISTINGS: "on" },
    workspaceSlug: HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
    actor: master,
    requested: "demo",
  }).serveFixtures,
  false,
);

const activation = activateHighOctaneListingSourceRequest({
  requested: "proptx-idx",
  demoEnabled: false,
  readiness: ready({ idxWebsiteApproved: false }),
});
assert.equal(activation.accepted, false);
assert.match(activation.blockers.join(" "), /IDX display/);

const demoOff = activateHighOctaneListingSourceRequest({
  requested: "demo",
  demoEnabled: false,
  readiness: ready({ connection: null }),
});
assert.equal(demoOff.accepted, false);

const disabled = activateHighOctaneListingSourceRequest({
  requested: "disabled",
  demoEnabled: false,
  readiness: ready({ connection: null }),
});
assert.equal(disabled.accepted, true);
assert.equal(disabled.selected, "disabled");

const itsoModule = readFileSync(join(root, "src/lib/listings/itso/itso-sources.ts"), "utf8");
assert.equal(itsoModule.includes("proptx"), false);
const panel = readFileSync(
  join(root, "src/components/platform/PlatformItsoListingSources.tsx"),
  "utf8",
);
assert.equal(panel.includes("ITSO Live"), false);
assert.equal(panel.includes("PropTx IDX"), true);
assert.equal(panel.includes("PropTx VOW"), true);
assert.equal(panel.includes("Disabled"), true);
const form = readFileSync(join(root, "src/components/platform/PlatformItsoSourceForm.tsx"), "utf8");
assert.equal(form.includes("Protected demo"), true);
assert.equal(form.includes("ITSO Live"), false);

console.log("high-octane-proptx-source-selftest: ok");
