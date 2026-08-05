/**
 * Add open-house fields to the Typesense `listings` collection (idempotent).
 * Usage: pnpm exec tsx scripts/typesense-ensure-open-house-fields.ts
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const {
    getTypesenseAdminClient,
    getTypesenseCollectionName,
  } = await import("../src/lib/typesense/client");

  const client = getTypesenseAdminClient();
  const name = getTypesenseCollectionName();
  const col = await client.collections(name).retrieve();
  const existing = new Set(
    (col.fields ?? []).map((f: { name: string }) => f.name),
  );

  const needed = [
    { name: "openHouseStartsAt", type: "int64[]", optional: true },
    { name: "openHouseEndsAt", type: "int64[]", optional: true },
    { name: "nextOpenHouseStartsAt", type: "int64", optional: true },
  ].filter((f) => !existing.has(f.name));

  if (needed.length === 0) {
    console.log(JSON.stringify({ ok: true, collection: name, added: [] }));
    return;
  }

  await client.collections(name).update({
    fields: needed as Array<{
      name: string;
      type: "int64" | "int64[]";
      optional: boolean;
    }>,
  });
  console.log(
    JSON.stringify({
      ok: true,
      collection: name,
      added: needed.map((f) => f.name),
    }),
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
