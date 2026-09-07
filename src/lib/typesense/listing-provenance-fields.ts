/**
 * Stage 6.11G.9B — Typesense listing provenance field definitions + ensure.
 *
 * Additive schema update only (same convention as open-house / bedsLabel).
 * G.9B: implement ensure; do NOT invoke against production until G.9C review.
 */

export type TypesenseListingProvenanceFieldDef = {
  name: "organizationId" | "providerKey" | "sourceAuthorityKey";
  type: "string";
  optional: true;
  facet: true;
};

/** Canonical schema defs for G.9B provenance fields. */
export const TYPESENSE_LISTING_PROVENANCE_FIELDS: readonly TypesenseListingProvenanceFieldDef[] =
  [
    {
      name: "organizationId",
      type: "string",
      optional: true,
      facet: true,
    },
    {
      name: "providerKey",
      type: "string",
      optional: true,
      facet: true,
    },
    {
      name: "sourceAuthorityKey",
      type: "string",
      optional: true,
      facet: true,
    },
  ] as const;

export type TypesenseCollectionFieldLike = {
  name: string;
};

export type TypesenseProvenanceSchemaClient = {
  collections: (name: string) => {
    retrieve: () => Promise<{ fields?: TypesenseCollectionFieldLike[] }>;
    update: (body: {
      fields: TypesenseListingProvenanceFieldDef[];
    }) => Promise<unknown>;
  };
};

/**
 * Idempotently add provenance fields to a Typesense listings collection.
 * Safe to call repeatedly. Does not recreate the collection.
 */
export async function ensureTypesenseListingProvenanceFields(input: {
  client: TypesenseProvenanceSchemaClient;
  collectionName: string;
}): Promise<{ collection: string; added: string[]; alreadyPresent: string[] }> {
  const col = await input.client.collections(input.collectionName).retrieve();
  const existing = new Set(
    (col.fields ?? []).map((f) => f.name),
  );

  const needed = TYPESENSE_LISTING_PROVENANCE_FIELDS.filter(
    (f) => !existing.has(f.name),
  );
  const alreadyPresent = TYPESENSE_LISTING_PROVENANCE_FIELDS.filter((f) =>
    existing.has(f.name),
  ).map((f) => f.name);

  if (needed.length > 0) {
    await input.client.collections(input.collectionName).update({
      fields: [...needed],
    });
  }

  return {
    collection: input.collectionName,
    added: needed.map((f) => f.name),
    alreadyPresent,
  };
}
