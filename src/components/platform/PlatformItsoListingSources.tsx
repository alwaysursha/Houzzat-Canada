import { PlatformDetailGrid } from "@/components/platform/PlatformDetailGrid";
import { PlatformItsoSourceForm } from "@/components/platform/PlatformItsoSourceForm";
import { PlatformPanel } from "@/components/platform/PlatformUi";
import { describeItsoListingSources } from "@/lib/listings/itso/itso-sources";
import {
  readItsoLiveSourceInput,
  readItsoSourceRequest,
} from "@/lib/listings/itso/itso-source-preference";
import { highOctaneDevelopmentListingsEnabled } from "@/lib/tenancy/templates/high-octane-development-listings";
import { HIGH_OCTANE_STAGING_WORKSPACE_SLUG } from "@/lib/tenancy/templates/high-octane-staging-slug";

function sourceValue(available: boolean, blockers: string[], availableLabel: string): string {
  if (available) return availableLabel;
  return blockers[0] ?? "Unavailable";
}

/** HIGH OCTANE source status and selector. It does not open an ITSO feed. */
export async function PlatformItsoListingSources({
  slug,
  workspaceId,
}: {
  slug: string;
  workspaceId: string;
}) {
  if (slug !== HIGH_OCTANE_STAGING_WORKSPACE_SLUG || !workspaceId.trim()) return null;
  const [requested, live] = await Promise.all([
    readItsoSourceRequest(workspaceId).catch(() => null),
    readItsoLiveSourceInput(workspaceId).catch(() => null),
  ]);
  const sources = describeItsoListingSources(highOctaneDevelopmentListingsEnabled(), {
    requested,
    live: live ?? undefined,
  });
  const connectionLabel = sources.live.available
    ? "Ready"
    : sources.live.blockers[0] ?? "Not connected";

  return (
    <PlatformPanel title="ITSO listing sources">
      <PlatformDetailGrid
        items={[
          { label: "Selected source", value: sources.selected },
          {
            label: "ITSO Demo",
            value: sourceValue(
              sources.demo.available,
              sources.demo.blockers,
              "Available in development mode",
            ),
          },
          { label: "ITSO Live", value: connectionLabel },
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
