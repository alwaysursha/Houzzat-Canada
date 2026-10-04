/**
 * Leads table pipeline menu must portal out of overflow-x-auto clipping.
 * Run: node --import tsx scripts/leads-table-pipeline-menu-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const table = readFileSync(
  join(root, "src/components/agent/LeadsTableClient.tsx"),
  "utf8",
);

assert.ok(table.includes('overflow-x-auto rounded border border-[#d8dee6]'));
assert.ok(table.includes('createPortal'));
assert.ok(table.includes("useFlyoutFixedStyle"));
assert.ok(table.includes('data-leads-pipeline-menu=""'));
assert.ok(table.includes("document.body"));
assert.equal(
  /absolute left-0 top-full z-30 mt-1 max-h-56 w-48/.test(table),
  false,
  "in-table absolute pipeline menu must be removed",
);
assert.ok(table.includes("pipelineLabel(s)"));
assert.ok(table.includes('patchLead(lead.id, {'));
assert.ok(table.includes("STATUSES.map"));

console.log("leads-table-pipeline-menu-selftest: ok");
