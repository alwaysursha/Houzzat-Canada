import { getListingProvider } from "@/lib/listings/provider";
import type { ListingDetail } from "@/lib/listings/types";
import {
  logSsrHang,
  readSsrHangCorrelation,
  SSR_HANG_EVENT,
  ssrHangErrorFields,
  type SsrHangNeonLookup,
} from "@/lib/observability/ssr-hang-log";
import { prisma } from "@/lib/prisma";
import {
  createPrismaPropTxProvenanceStore,
  PROPTX_LISTING_PROVIDER_KEY,
  resolvePropTxListingProvenance,
} from "@/lib/proptx/listing-provenance";
import { mapMlsNumber } from "@/lib/proptx/map-listing";
import { lookupPropTxOnDemand } from "@/lib/proptx/on-demand-lookup";
import { transientListingDetailFromPropTx } from "@/lib/proptx/read-only-listing";
import {
  decideMlsListingDetailEntitlement,
  evaluateWebListingDetailInventoryAccess,
  isWebListingDetailEntitlementEnforcementEnabled,
  type ListingDataCapability,
  type WorkspaceListingEntitlement,
} from "@/lib/tenancy/listing-entitlement";

export type LoadListingForDetailPageOptions = {
  /**
   * Server-resolved G.10A entitlement (hostname → G.7C → workspace).
   * Never accept client workspaceId / org / provider / SAK.
   */
  entitlement?: WorkspaceListingEntitlement;
  /**
   * Web-only force-enable (G.10C1). Mobile omits → follows G5 (OFF).
   * `false` NEVER disables enforcement when G5 is later ON.
   */
  entitlementFilteringEnabled?: boolean;
  /**
   * Server-resolved HIGH OCTANE staging snapshot channel.
   * Snapshot rows stay denied when this is omitted.
   */
  stagingSnapshotVisible?: boolean;
  /**
   * Override capability. When omitted under enforcement, derived from
   * listing status via {@link listingDetailCapabilityForStatus}.
   * On Neon miss PropTx pre-auth, defaults to ACTIVE_LISTINGS.
   */
  requiredCapability?: ListingDataCapability;
  /**
   * Test-only injection for PropTx on-demand ordering proofs.
   * Production omits → real read-only {@link lookupPropTxOnDemand}.
   */
  onDemandLookup?: (
    mlsNumber: string,
  ) => Promise<{
    mlsNumbers: string[];
    rows?: Array<Record<string, unknown>>;
  }>;
  /**
   * Test-only Neon detail lookup injection (avoids live DB in selftests).
   */
  getByMlsForDetailPage?: (
    mlsNumber: string,
  ) => Promise<ListingDetail | null>;
  /**
   * Test-only canonical TRREB organization id (from PropTx provenance).
   * Production resolves via {@link resolvePropTxListingProvenance}.
   */
  propTxOrganizationId?: string;
};

export type MayInvokePropTxOnDemandForDetailInput = {
  entitlementFilteringEnabled?: boolean;
  entitlement?: WorkspaceListingEntitlement | null;
  requiredCapability?: ListingDataCapability;
  /**
   * Canonical TRREB RealEstateOrganization id
   * (`resolvePropTxListingProvenance` / slug `ca-on-trreb`).
   */
  propTxOrganizationId: string;
};

/**
 * Pure PRE-LOOKUP gate for PropTx on-demand (Neon miss).
 *
 * When web enforcement is ON, requires exact
 * (canonical TRREB org, providerKey=proptx, required capability)
 * via G.10C0 — never "any MLS authority".
 *
 * When enforcement is OFF (mobile/legacy) → true.
 */
export function mayInvokePropTxOnDemandForDetail(
  input: MayInvokePropTxOnDemandForDetailInput,
): boolean {
  const enforce = isWebListingDetailEntitlementEnforcementEnabled(
    input.entitlementFilteringEnabled,
  );
  if (!enforce) return true;

  const capability = input.requiredCapability ?? "ACTIVE_LISTINGS";
  const decision = decideMlsListingDetailEntitlement({
    entitlement: input.entitlement,
    organizationId: input.propTxOrganizationId,
    providerKey: PROPTX_LISTING_PROVIDER_KEY,
    dataSource: "mls",
    requiredCapability: capability,
  });
  return decision.allowed;
}

async function resolveCanonicalPropTxOrganizationId(
  options?: LoadListingForDetailPageOptions,
): Promise<string | null> {
  if (options?.propTxOrganizationId?.trim()) {
    return options.propTxOrganizationId.trim();
  }
  try {
    const provenance = await resolvePropTxListingProvenance(
      createPrismaPropTxProvenanceStore(prisma),
    );
    return provenance.organizationId;
  } catch {
    // Directory missing/invalid → fail closed (no PropTx warm).
    return null;
  }
}

function applyDetailEntitlementGate(
  listing: ListingDetail,
  options: LoadListingForDetailPageOptions | undefined,
): ListingDetail | null {
  const decision = evaluateWebListingDetailInventoryAccess({
    entitlement: options?.entitlement,
    entitlementFilteringEnabled: options?.entitlementFilteringEnabled,
    stagingSnapshotVisible: options?.stagingSnapshotVisible,
    organizationId: listing.organizationId,
    providerKey: listing.providerKey,
    dataSource: listing.dataSource,
    status: listing.status,
    baseCapabilityOverride: options?.requiredCapability,
  });
  return decision.allowed ? listing : null;
}

/**
 * Lean listing load shared by /listing/... RSC and GET /api/listings/[mls]/panel.
 * Neon media ≤5, price-change history ≤5, no rooms / open houses.
 * Auth and VOW stay outside — this is MLS inventory + optional G.10C entitlement.
 *
 * G.10C1 ordering when web enforcement is ON:
 *   Neon lookup → channel/status/provenance → G.10C0 decision
 *   Neon miss → PRE-LOOKUP exact TRREB/proptx/capability
 *            → PropTx on-demand only if pre-check allows
 *            → POST-LOOKUP G.10C0 gate on actual listing provenance
 */
export async function loadListingForDetailPage(
  mlsNumberRaw: string,
  options?: LoadListingForDetailPageOptions,
): Promise<ListingDetail | null> {
  const startedAt = Date.now();
  const correlation = await readSsrHangCorrelation();
  logSsrHang({ event: SSR_HANG_EVENT.listingStart, ...correlation });

  const finish = (neon: SsrHangNeonLookup, listing: ListingDetail | null) => {
    logSsrHang({
      event: SSR_HANG_EVENT.listingSuccess,
      ms: Date.now() - startedAt,
      neon,
      ...correlation,
    });
    return listing;
  };

  try {
    const mlsNumber = mlsNumberRaw.trim().toUpperCase();
    if (!mlsNumber) return finish("SKIP", null);

    const onDemand = options?.onDemandLookup ?? lookupPropTxOnDemand;
    const getByMls =
      options?.getByMlsForDetailPage ??
      ((mls: string) => getListingProvider().getByMlsForDetailPage(mls));

    let listing = await getByMls(mlsNumber);

    if (listing) {
      return finish("HIT", applyDetailEntitlementGate(listing, options));
    }

    const enforce = isWebListingDetailEntitlementEnforcementEnabled(
      options?.entitlementFilteringEnabled,
    );
    let propTxOrganizationId: string | null = null;
    if (enforce) {
      propTxOrganizationId = await resolveCanonicalPropTxOrganizationId(options);
      if (
        !propTxOrganizationId ||
        !mayInvokePropTxOnDemandForDetail({
          entitlementFilteringEnabled: options?.entitlementFilteringEnabled,
          entitlement: options?.entitlement,
          requiredCapability: options?.requiredCapability,
          propTxOrganizationId,
        })
      ) {
        return finish("MISS", null);
      }
    }

    const pulled = await onDemand(mlsNumber);
    if (pulled.mlsNumbers.length === 0) return finish("MISS", null);

    listing = await getByMls(mlsNumber);
    if (listing) {
      return finish("MISS", applyDetailEntitlementGate(listing, options));
    }

    const row = (pulled.rows ?? []).find(
      (candidate) => mapMlsNumber(candidate)?.toUpperCase() === mlsNumber,
    );
    const live = row
      ? transientListingDetailFromPropTx(row, {
          organizationId: propTxOrganizationId,
          providerKey: propTxOrganizationId
            ? PROPTX_LISTING_PROVIDER_KEY
            : null,
        })
      : null;
    if (!live) return finish("MISS", null);
    return finish("MISS", applyDetailEntitlementGate(live, options));
  } catch (error) {
    logSsrHang({
      event: SSR_HANG_EVENT.listingFailure,
      ms: Date.now() - startedAt,
      ...correlation,
      ...ssrHangErrorFields(error),
    });
    throw error;
  }
}
