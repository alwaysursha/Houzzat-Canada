import { PlatformDetailGrid } from "@/components/platform/PlatformDetailGrid";
import { PlatformItsoSourceForm } from "@/components/platform/PlatformItsoSourceForm";
import { PlatformPanel } from "@/components/platform/PlatformUi";
import { highOctaneDevelopmentListingsEnabled } from "@/lib/tenancy/templates/high-octane-development-listings";
import {
  readHighOctaneListingSourceRequest,
  readHighOctanePropTxReadiness,
} from "@/lib/tenancy/templates/high-octane-listing-source-preference";
import {
  evaluateHighOctanePropTxSource,
  type HighOctaneListingSourceRequest,
} from "@/lib/tenancy/templates/high-octane-proptx-source";
import { HIGH_OCTANE_STAGING_WORKSPACE_SLUG } from "@/lib/tenancy/templates/high-octane-staging-slug";

function sourceValue(available: boolean, blockers: string[], availableLabel: string): string {
  if (available) return availableLabel;
  return blockers[0] ?? "Unavailable";
}

function selectableRequest(
  stored: string | null,
): HighOctaneListingSourceRequest | null {
  if (
    stored === "proptx-idx" ||
    stored === "proptx-vow" ||
    stored === "demo" ||
    stored === "disabled"
  ) {
    return stored;
  }
  return null;
}

/** HIGH OCTANE source status. It does not open a feed or share Houzzat credentials. */
export async function PlatformItsoListingSources({
  slug,
  workspaceId,
}: {
  slug: string;
  workspaceId: string;
}) {
  if (slug !== HIGH_OCTANE_STAGING_WORKSPACE_SLUG || !workspaceId.trim()) return null;
  const [stored, readiness] = await Promise.all([
    readHighOctaneListingSourceRequest(workspaceId).catch(() => null),
    readHighOctanePropTxReadiness(workspaceId).catch(() => null),
  ]);
  const requested = selectableRequest(stored);
  const snapshot = readiness ?? {
    workspaceId,
    connection: null,
    membershipStatus: null,
    primaryDomainActive: false,
    idxWebsiteApproved: false,
    vowApproved: false,
  };
  const idx = evaluateHighOctanePropTxSource("idx", snapshot);
  const vow = evaluateHighOctanePropTxSource("vow", snapshot);
  const demoAvailable = highOctaneDevelopmentListingsEnabled();

  return (
    <PlatformPanel title="Listing source">
      <PlatformDetailGrid
        items={[
          { label: "Selected source", value: requested ?? "disabled" },
          {
            label: "PropTx IDX",
            value: sourceValue(idx.available, idx.blockers, "Ready for this workspace"),
          },
          {
            label: "PropTx VOW",
            value: sourceValue(vow.available, vow.blockers, "Ready for this workspace"),
          },
          {
            label: "Protected demo",
            value: demoAvailable
              ? "Available in development mode"
              : "Off in production",
          },
          { label: "Disabled", value: "No inventory" },
        ]}
      />
      <PlatformItsoSourceForm
        key={requested ?? "unset"}
        workspaceId={workspaceId}
        requested={requested}
      />
    </PlatformPanel>
  );
}
