/**
 * Staging-only retirement for the temporary listing snapshot.
 * A matching MLS number on any other source is left in place.
 * The dry-run command does not call the writer.
 */
import type { Prisma } from "@prisma/client";
import { evaluateHighOctaneStagingEnvironment } from "@/lib/tenancy/templates/high-octane-staging";
import {
  assertHighOctaneStagingSnapshotBranch,
  HIGH_OCTANE_STAGING_SNAPSHOT_DATA_SOURCE,
  HIGH_OCTANE_STAGING_SNAPSHOT_PROVIDER_KEY,
  type StagingSnapshotBranchRow,
} from "@/lib/tenancy/templates/high-octane-staging-snapshot";

export const HIGH_OCTANE_STAGING_SNAPSHOT_RETIRE_CONFIRMATION =
  "RETIRE_HIGH_OCTANE_STAGING_SNAPSHOT" as const;

export function snapshotRetirementCliDecision(
  args: readonly string[],
): "dry-run" | "refused" {
  if (args.length > 1) return "refused";
  if (args.length === 1 && args[0] !== "--dry-run") return "refused";
  return "dry-run";
}

export type SnapshotRetirementExisting = {
  mlsNumber: string;
  dataSource: string;
  providerKey: string | null;
};

export type SnapshotRetirementPlan = {
  retire: string[];
  keptDifferentSource: Array<{ mlsNumber: string; dataSource: string; providerKey: string | null }>;
  missing: string[];
};

function snapshotIdentity(row: SnapshotRetirementExisting): boolean {
  return (
    row.dataSource === HIGH_OCTANE_STAGING_SNAPSHOT_DATA_SOURCE &&
    row.providerKey === HIGH_OCTANE_STAGING_SNAPSHOT_PROVIDER_KEY
  );
}

/** Preview only. Does not open a connection. */
export function planHighOctaneStagingSnapshotRetirement(input: {
  manifestMlsNumbers: readonly string[];
  existing?: readonly SnapshotRetirementExisting[];
}): SnapshotRetirementPlan {
  const existing = new Map(
    (input.existing ?? []).map((row) => [row.mlsNumber.trim().toUpperCase(), row]),
  );
  const retire: string[] = [];
  const keptDifferentSource: SnapshotRetirementPlan["keptDifferentSource"] = [];
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const raw of input.manifestMlsNumbers) {
    const mlsNumber = raw.trim();
    const key = mlsNumber.toUpperCase();
    if (!mlsNumber || seen.has(key)) continue;
    seen.add(key);
    const row = existing.get(key);
    if (!row) {
      missing.push(mlsNumber);
      continue;
    }
    if (!snapshotIdentity(row)) {
      keptDifferentSource.push({
        mlsNumber: row.mlsNumber,
        dataSource: row.dataSource,
        providerKey: row.providerKey,
      });
      continue;
    }
    retire.push(row.mlsNumber);
  }
  return { retire, keptDifferentSource, missing };
}

export function stagingSnapshotRetirementWhere(
  mlsNumbers: readonly string[],
): Prisma.ListingWhereInput {
  return {
    mlsNumber: { in: [...mlsNumbers] },
    dataSource: HIGH_OCTANE_STAGING_SNAPSHOT_DATA_SOURCE,
    providerKey: HIGH_OCTANE_STAGING_SNAPSHOT_PROVIDER_KEY,
    organizationId: null,
    isMock: false,
  };
}

export type StagingSnapshotRetirementClient = {
  query: (sql: string) => Promise<{ rows: StagingSnapshotBranchRow[] }>;
  listing: {
    findMany: (args: {
      where: Prisma.ListingWhereInput;
      select: { id: true; mlsNumber: true };
    }) => Promise<Array<{ id: string; mlsNumber: string }>>;
    deleteMany: (args: { where: Prisma.ListingWhereInput }) => Promise<{ count: number }>;
  };
  listingMedia: {
    deleteMany: (args: { where: { listingId: { in: string[] } } }) => Promise<{ count: number }>;
  };
  listingRoom: {
    deleteMany: (args: { where: { listingId: { in: string[] } } }) => Promise<{ count: number }>;
  };
  listingSource: {
    deleteMany: (args: { where: { listingId: { in: string[] } } }) => Promise<{ count: number }>;
  };
  listingHistory: {
    deleteMany: (args: { where: { listingId: { in: string[] } } }) => Promise<{ count: number }>;
  };
  openHouse: {
    deleteMany: (args: { where: { listingId: { in: string[] } } }) => Promise<{ count: number }>;
  };
};

/**
 * Later authorized delete. Refuses production, the wrong confirmation,
 * and any branch other than the HIGH OCTANE staging branch.
 */
export async function applyHighOctaneStagingSnapshotRetirement(input: {
  confirmation: string;
  env?: NodeJS.ProcessEnv;
  manifestMlsNumbers: readonly string[];
  writer: {
    transaction: <T>(fn: (tx: StagingSnapshotRetirementClient) => Promise<T>) => Promise<T>;
  };
}): Promise<{ retired: string[] }> {
  if (input.confirmation !== HIGH_OCTANE_STAGING_SNAPSHOT_RETIRE_CONFIRMATION) {
    throw new Error("staging snapshot retirement refused");
  }
  if (!evaluateHighOctaneStagingEnvironment(input.env ?? process.env).ready) {
    throw new Error("staging snapshot retirement refused");
  }
  const manifest = input.manifestMlsNumbers.map((value) => value.trim()).filter(Boolean);
  if (manifest.length === 0) throw new Error("staging snapshot retirement refused");
  return input.writer.transaction(async (tx) => {
    await assertHighOctaneStagingSnapshotBranch((sql) => tx.query(sql));
    const matches = await tx.listing.findMany({
      where: stagingSnapshotRetirementWhere(manifest),
      select: { id: true, mlsNumber: true },
    });
    if (matches.length === 0) return { retired: [] };
    const ids = matches.map((row) => row.id);
    const listingId = { in: ids };
    await tx.listingMedia.deleteMany({ where: { listingId } });
    await tx.listingRoom.deleteMany({ where: { listingId } });
    await tx.listingSource.deleteMany({ where: { listingId } });
    await tx.listingHistory.deleteMany({ where: { listingId } });
    await tx.openHouse.deleteMany({ where: { listingId } });
    await tx.listing.deleteMany({
      where: {
        id: { in: ids },
        dataSource: HIGH_OCTANE_STAGING_SNAPSHOT_DATA_SOURCE,
        providerKey: HIGH_OCTANE_STAGING_SNAPSHOT_PROVIDER_KEY,
      },
    });
    return { retired: matches.map((row) => row.mlsNumber) };
  });
}
