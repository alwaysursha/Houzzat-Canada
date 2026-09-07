/**
 * Stage 6.11G.9C — READ-ONLY Typesense post-reindex provenance verification.
 * DO NOT COMMIT. No schema updates, imports, deletes, or Neon writes.
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const TRREB = "cmtrdf23t000091u0cw3a5zu9";
const PROVIDER = "proptx";
const SAK = `${TRREB}:${PROVIDER}`;

type HitDoc = {
  id?: string;
  mlsNumber?: string;
  organizationId?: string;
  providerKey?: string;
  sourceAuthorityKey?: string;
  dataSource?: string;
  status?: string;
};

function present(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

async function searchCount(
  client: {
    collections: (name: string) => {
      documents: () => {
        search: (q: Record<string, unknown>) => Promise<{
          found?: number;
          facet_counts?: Array<{
            field_name: string;
            counts: Array<{ value: string; count: number }>;
          }>;
          hits?: Array<{ document: HitDoc }>;
        }>;
      };
    };
  },
  collection: string,
  params: Record<string, unknown>,
) {
  return client.collections(collection).documents().search({
    q: "*",
    query_by: "mlsNumber",
    per_page: 0,
    ...params,
  });
}

async function main() {
  const {
    getTypesenseAdminClient,
    getTypesenseCollectionName,
  } = await import("../src/lib/typesense/client");

  const client = getTypesenseAdminClient();
  const collection = getTypesenseCollectionName();

  console.log(`G.9C READ-ONLY verify → collection=${collection}`);
  console.log(`canonical org=${TRREB} provider=${PROVIDER} sak=${SAK}\n`);

  const schema = await client.collections(collection).retrieve();
  const numDocuments = schema.num_documents ?? null;
  const fieldNames = new Set((schema.fields ?? []).map((f: { name: string }) => f.name));
  for (const f of ["organizationId", "providerKey", "sourceAuthorityKey"]) {
    console.log(`schema.${f}: ${fieldNames.has(f) ? "present" : "MISSING"}`);
  }
  console.log(`schema.num_documents: ${numDocuments}`);

  // Faceted overview (read-only search)
  const facets = await searchCount(client, collection, {
    facet_by: "organizationId,providerKey,sourceAuthorityKey",
    max_facet_values: 50,
  });
  const found = facets.found ?? 0;
  console.log(`search found(*): ${found}`);

  const facetMap = new Map<string, Array<{ value: string; count: number }>>();
  for (const fc of facets.facet_counts ?? []) {
    facetMap.set(fc.field_name, fc.counts ?? []);
  }

  function facetSum(field: string): number {
    return (facetMap.get(field) ?? []).reduce((a, c) => a + c.count, 0);
  }
  function facetValue(field: string, value: string): number {
    return (facetMap.get(field) ?? []).find((c) => c.value === value)?.count ?? 0;
  }

  const withOrgFacet = facetSum("organizationId");
  const withProviderFacet = facetSum("providerKey");
  const withSakFacet = facetSum("sourceAuthorityKey");
  const canonicalOrgFacet = facetValue("organizationId", TRREB);
  const canonicalProviderFacet = facetValue("providerKey", PROVIDER);
  const canonicalSakFacet = facetValue("sourceAuthorityKey", SAK);

  console.log("\n--- facet sums ---");
  console.log(`organizationId present (facet sum): ${withOrgFacet}`);
  console.log(`providerKey present (facet sum): ${withProviderFacet}`);
  console.log(`sourceAuthorityKey present (facet sum): ${withSakFacet}`);
  console.log(`organizationId=${TRREB}: ${canonicalOrgFacet}`);
  console.log(`providerKey=${PROVIDER}: ${canonicalProviderFacet}`);
  console.log(`sourceAuthorityKey=${SAK}: ${canonicalSakFacet}`);
  console.log("organizationId facet values:");
  for (const c of facetMap.get("organizationId") ?? []) {
    console.log(`  ${c.value}: ${c.count}`);
  }
  console.log("providerKey facet values:");
  for (const c of facetMap.get("providerKey") ?? []) {
    console.log(`  ${c.value}: ${c.count}`);
  }
  console.log("sourceAuthorityKey facet values:");
  for (const c of facetMap.get("sourceAuthorityKey") ?? []) {
    console.log(`  ${c.value}: ${c.count}`);
  }

  // Filtered exact counts (found)
  const allThree = await searchCount(client, collection, {
    filter_by: `organizationId:=${TRREB} && providerKey:=${PROVIDER} && sourceAuthorityKey:=${SAK}`,
  });
  console.log(`\nfilter all-three canonical found: ${allThree.found ?? 0}`);

  // Full export scan for partial / null / noncanonical (read-only)
  console.log("\nStreaming export for exact provenance classification...");
  const exportRaw: string = await client
    .collections(collection)
    .documents()
    .export({ exclude_fields: "" } as never);

  // Typesense export returns NDJSON string (or the client may return string)
  const lines = String(exportRaw)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let scanned = 0;
  let withOrg = 0;
  let withProvider = 0;
  let withSak = 0;
  let withAllThree = 0;
  let withCanonicalAll = 0;
  let partial = 0;
  let provenanceNull = 0;
  let noncanonical = 0;
  const noncanonicalSamples: HitDoc[] = [];
  const partialSamples: HitDoc[] = [];
  const nullSamples: HitDoc[] = [];
  const canonicalSamples: HitDoc[] = [];
  const orgValues = new Map<string, number>();
  const providerValues = new Map<string, number>();
  const sakValues = new Map<string, number>();

  for (const line of lines) {
    let doc: HitDoc;
    try {
      doc = JSON.parse(line) as HitDoc;
    } catch {
      continue;
    }
    scanned += 1;
    const org = present(doc.organizationId) ? doc.organizationId.trim() : "";
    const provider = present(doc.providerKey) ? doc.providerKey.trim() : "";
    const sak = present(doc.sourceAuthorityKey)
      ? doc.sourceAuthorityKey.trim()
      : "";
    const nPresent = [org, provider, sak].filter(Boolean).length;

    if (org) {
      withOrg += 1;
      orgValues.set(org, (orgValues.get(org) ?? 0) + 1);
    }
    if (provider) {
      withProvider += 1;
      providerValues.set(provider, (providerValues.get(provider) ?? 0) + 1);
    }
    if (sak) {
      withSak += 1;
      sakValues.set(sak, (sakValues.get(sak) ?? 0) + 1);
    }

    if (nPresent === 0) {
      provenanceNull += 1;
      if (nullSamples.length < 8) nullSamples.push(doc);
    } else if (nPresent < 3) {
      partial += 1;
      if (partialSamples.length < 8) partialSamples.push(doc);
    } else {
      withAllThree += 1;
      const isCanonical =
        org === TRREB && provider === PROVIDER && sak === SAK;
      if (isCanonical) {
        withCanonicalAll += 1;
        if (canonicalSamples.length < 8) canonicalSamples.push(doc);
      } else {
        noncanonical += 1;
        if (noncanonicalSamples.length < 8) noncanonicalSamples.push(doc);
      }
    }
  }

  console.log("\n=== EXPORT SCAN RESULTS ===");
  console.log(JSON.stringify({
    scanned,
    schemaNumDocuments: numDocuments,
    searchFoundStar: found,
    withOrganizationId: withOrg,
    withProviderKey: withProvider,
    withSourceAuthorityKey: withSak,
    withAllThreeProvenanceFields: withAllThree,
    canonicalAllThree: withCanonicalAll,
    partialProvenance: partial,
    provenanceNull,
    noncanonical,
    orgValues: Object.fromEntries(orgValues),
    providerValues: Object.fromEntries(providerValues),
    sakValues: Object.fromEntries(sakValues),
  }, null, 2));

  function summarize(docs: HitDoc[]) {
    return docs.map((d) => ({
      id: d.id ?? null,
      mlsNumber: d.mlsNumber ?? null,
      organizationId: d.organizationId ?? null,
      providerKey: d.providerKey ?? null,
      sourceAuthorityKey: d.sourceAuthorityKey ?? null,
      dataSource: d.dataSource ?? null,
      status: d.status ?? null,
    }));
  }

  console.log("\n--- canonical samples ---");
  console.log(JSON.stringify(summarize(canonicalSamples), null, 2));
  console.log("\n--- partial samples ---");
  console.log(JSON.stringify(summarize(partialSamples), null, 2));
  console.log("\n--- null samples ---");
  console.log(JSON.stringify(summarize(nullSamples), null, 2));
  console.log("\n--- noncanonical samples ---");
  console.log(JSON.stringify(summarize(noncanonicalSamples), null, 2));

  // Optional Neon read-only context for null docs (no writes)
  try {
    const { prisma } = await import("../src/lib/prisma");
    const neonTotal = await prisma.listing.count({ where: { isMock: false } });
    const neonMls = await prisma.listing.count({
      where: { isMock: false, dataSource: "mls" },
    });
    const neonMlsCanonical = await prisma.listing.count({
      where: {
        isMock: false,
        dataSource: "mls",
        organizationId: TRREB,
        providerKey: PROVIDER,
      },
    });
    const neonMlsMissingProv = await prisma.listing.count({
      where: {
        isMock: false,
        dataSource: "mls",
        OR: [{ organizationId: null }, { providerKey: null }],
      },
    });
    const neonNonMls = await prisma.listing.count({
      where: { isMock: false, dataSource: { not: "mls" } },
    });
    const neonNonMlsNullProv = await prisma.listing.count({
      where: {
        isMock: false,
        dataSource: { not: "mls" },
        organizationId: null,
        providerKey: null,
      },
    });
    const neonNonMlsBySource = await prisma.listing.groupBy({
      by: ["dataSource"],
      where: { isMock: false, dataSource: { not: "mls" } },
      _count: { _all: true },
    });
    console.log("\n=== NEON READ-ONLY CONTEXT ===");
    console.log(JSON.stringify({
      neonTotalNonMock: neonTotal,
      neonMls,
      neonMlsCanonical,
      neonMlsMissingProv,
      neonNonMls,
      neonNonMlsNullProv,
      neonNonMlsBySource: neonNonMlsBySource.map((r) => ({
        dataSource: r.dataSource,
        count: r._count._all,
      })),
    }, null, 2));
  } catch (err) {
    console.log("\nNeon context unavailable:", err instanceof Error ? err.message : err);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
