import assert from "node:assert/strict";
import { z } from "zod";
import {
  isSavedListingsChangedMessage,
  isSavedListingsRevStorageKey,
  SAVED_LISTINGS_CHANGED_MESSAGE,
} from "../src/lib/account/saved-listings-sync";

/** Mirrors /api/saved-listings mlsNumber schema. */
const mlsSchema = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .transform((v) => v.trim().toUpperCase());

function testMlsNormalize() {
  assert.equal(mlsSchema.parse("  w13698330  "), "W13698330");
  assert.equal(mlsSchema.parse("X9KW1001"), "X9KW1001");
  assert.throws(() => mlsSchema.parse("ab"));
}

/**
 * Mirrors the POST find-then-create path (no empty upsert update).
 * Ensures re-save of the same MLS does not invent a second row key.
 */
function testFindOrCreateNoDuplicate() {
  const rows = new Map<string, { userId: string; mlsNumber: string }>();

  function save(userId: string, mlsNumber: string) {
    const key = `${userId}:${mlsNumber}`;
    const existing = rows.get(key);
    if (existing) return { created: false, item: existing };
    const item = { userId, mlsNumber };
    rows.set(key, item);
    return { created: true, item };
  }

  const a1 = save("user-a", "W1");
  const a2 = save("user-a", "W1");
  const b1 = save("user-b", "W1");
  const a3 = save("user-a", "W2");

  assert.equal(a1.created, true);
  assert.equal(a2.created, false);
  assert.equal(b1.created, true);
  assert.equal(a3.created, true);
  assert.equal(rows.size, 3);

  rows.delete("user-a:W1");
  assert.equal(rows.has("user-a:W2"), true);
  assert.equal(rows.has("user-b:W1"), true);
  assert.equal(rows.has("user-a:W1"), false);
}

function testSyncMessageHelpers() {
  assert.equal(
    isSavedListingsChangedMessage({ type: SAVED_LISTINGS_CHANGED_MESSAGE }),
    true,
  );
  assert.equal(isSavedListingsChangedMessage({ type: "other" }), false);
  assert.equal(
    isSavedListingsRevStorageKey("houzzat:saved-listings-rev"),
    true,
  );
  assert.equal(isSavedListingsRevStorageKey("other"), false);
}

/** Stale in-flight reload must not clobber a newer reload's result. */
function testReloadGeneration() {
  let gen = 0;
  let applied: string[] | null = null;

  async function reload(label: string, delayMs: number, items: string[]) {
    const my = ++gen;
    await new Promise((r) => setTimeout(r, delayMs));
    if (my !== gen) return;
    applied = items;
    void label;
  }

  return Promise.all([
    reload("stale", 30, []),
    reload("fresh", 5, ["W1"]),
  ]).then(() => {
    assert.deepEqual(applied, ["W1"]);
  });
}

async function main() {
  testMlsNormalize();
  testFindOrCreateNoDuplicate();
  testSyncMessageHelpers();
  await testReloadGeneration();
  console.log("saved-listings-selftest: ok");
}

void main();
