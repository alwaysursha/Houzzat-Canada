import { PlatformDetailGrid } from "@/components/platform/PlatformDetailGrid";
import { PlatformPanel } from "@/components/platform/PlatformUi";
import { describeItsoListingSources } from "@/lib/listings/itso/itso-sources";
import { highOctaneDevelopmentListingsEnabled } from "@/lib/tenancy/templates/high-octane-development-listings";
import { HIGH_OCTANE_STAGING_WORKSPACE_SLUG } from "@/lib/tenancy/templates/high-octane-staging-slug";

function sourceValue(available: boolean, blockers: string[]): string {
  if (available) return "Available in development mode";
  return blockers[0] ?? "Unavailable";
}

/** Read-only ITSO source status. It does not connect a feed or change entitlements. */
export function PlatformItsoListingSources({ slug }: { slug: string }) {
  if (slug !== HIGH_OCTANE_STAGING_WORKSPACE_SLUG) return null;
  const sources = describeItsoListingSources(highOctaneDevelopmentListingsEnabled());
  return (
    <PlatformPanel title="ITSO listing sources">
      <PlatformDetailGrid
        items={[
          { label: "Selected source", value: sources.selected },
          {
            label: "ITSO Demo",
            value: sourceValue(sources.demo.available, sources.demo.blockers),
          },
          {
            label: "ITSO Live",
            value: sourceValue(sources.live.available, sources.live.blockers),
          },
        ]}
      />
    </PlatformPanel>
  );
}
