/**
 * Stage 3K.5.41 — Selftest for Agent Deferred Client Render Optimization.
 * Run: pnpm agent-deferred-render:selftest
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testQuickModulesLazyMountWiring() {
  const qmSrc = read("src/components/agent/QuickModulesPanel.tsx");

  // Verify on-demand openedIds tracking
  assert.ok(qmSrc.includes("const [openedIds, setOpenedIds] = useState<Set<ModuleId>>"));
  assert.ok(qmSrc.includes("const hasBeenOpened = open || openedIds.has(mod.id)"));
  assert.ok(qmSrc.includes("{hasBeenOpened ? mod.body : null}"));

  // Verify toggle manages openedIds
  assert.ok(qmSrc.includes("setOpenedIds((prev) =>"));
}

function testContactRequestedOptimizationWiring() {
  const crSrc = read("src/components/agent/ContactRequestedPanel.tsx");

  // Verify ContactSlide is memoized
  assert.ok(crSrc.includes("const ContactSlide = memo(function ContactSlide"));

  // Verify tagLead and handleOpenLead are stabilized
  assert.ok(crSrc.includes("const handleOpenLead = useCallback("));
  assert.ok(crSrc.includes("const tagLead = useCallback("));
}

function runAll() {
  testQuickModulesLazyMountWiring();
  testContactRequestedOptimizationWiring();
  console.log("agent-deferred-render:selftest OK");
}

runAll();
