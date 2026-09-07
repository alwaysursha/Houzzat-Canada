/**
 * Idempotent additive Typesense schema patch for listing provenance fields.
 *
 *   pnpm typesense:provenance-fields
 *
 * G.9B: code exists; DO NOT run against production until G.9C review.
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  const {
    getTypesenseAdminClient,
    getTypesenseCollectionName,
  } = await import("../src/lib/typesense/client");
  const { ensureTypesenseListingProvenanceFields } = await import(
    "../src/lib/typesense/listing-provenance-fields"
  );

  const client = getTypesenseAdminClient();
  const name = getTypesenseCollectionName();
  const result = await ensureTypesenseListingProvenanceFields({
    client,
    collectionName: name,
  });
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
