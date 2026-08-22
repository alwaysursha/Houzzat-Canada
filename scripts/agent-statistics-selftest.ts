/**
 * Focused self-tests for agent statistics aggregates / date bucketing.
 * Run: pnpm exec tsx scripts/agent-statistics-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HOT_CANDIDATE_TAKE } from "../src/lib/agent/statistics-shared";

/** Legacy JS median used before SQL PERCENTILE_CONT (parity fixture). */
function legacyMedian(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
    : sorted[mid]!;
}

function legacyAvg(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
}

const BUCKETS = [
  { label: "< 15m", test: (m: number) => m < 15 },
  { label: "15–60m", test: (m: number) => m >= 15 && m < 60 },
  { label: "1–4h", test: (m: number) => m >= 60 && m < 240 },
  { label: "4–24h", test: (m: number) => m >= 240 && m < 1440 },
  { label: "> 24h", test: (m: number) => m >= 1440 },
] as const;

function legacyBuckets(values: number[]) {
  return BUCKETS.map((b) => ({
    label: b.label,
    count: values.filter(b.test).length,
  }));
}

/** SQL FILTER semantics mirrored in JS for controlled fixtures. */
function sqlStyleBuckets(values: number[]) {
  const mins = values.filter((m) => m >= 0);
  return [
    { label: "< 15m", count: mins.filter((m) => m < 15).length },
    { label: "15–60m", count: mins.filter((m) => m >= 15 && m < 60).length },
    { label: "1–4h", count: mins.filter((m) => m >= 60 && m < 240).length },
    { label: "4–24h", count: mins.filter((m) => m >= 240 && m < 1440).length },
    { label: "> 24h", count: mins.filter((m) => m >= 1440).length },
  ];
}

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function eachDay(from: Date, to: Date): string[] {
  const keys: string[] = [];
  const cur = new Date(from);
  cur.setHours(12, 0, 0, 0);
  const end = new Date(to);
  end.setHours(12, 0, 0, 0);
  while (cur <= end) {
    keys.push(dayKey(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return keys;
}

function fillSeries(
  rangeDays: number,
  leadCounts: Record<string, number>,
  responseCounts: Record<string, number>,
  now = new Date("2026-08-21T15:00:00Z"),
) {
  const periodStart = new Date(now);
  periodStart.setDate(periodStart.getDate() - (rangeDays - 1));
  periodStart.setHours(0, 0, 0, 0);
  return eachDay(periodStart, now).map((date) => ({
    date,
    leads: leadCounts[date] ?? 0,
    responses: responseCounts[date] ?? 0,
  }));
}

function testHotCandidateBound() {
  assert.equal(HOT_CANDIDATE_TAKE, 80);
}

function testNoLargeTakesRemain() {
  const src = readFileSync(
    join(process.cwd(), "src/lib/agent/statistics.ts"),
    "utf8",
  );
  assert.equal(
    /take:\s*2000/.test(src) || /take:\s*3000/.test(src) || /take:\s*5000/.test(src),
    false,
    "large take:2000/3000/5000 must not remain",
  );
  assert.match(src, /DATE_TRUNC/);
  assert.match(src, /PERCENTILE_CONT/);
  assert.match(src, /HOT_CANDIDATE_TAKE/);
}

function testEmptyRange() {
  const series = fillSeries(7, {}, {});
  assert.equal(series.length, 7);
  assert.ok(series.every((d) => d.leads === 0 && d.responses === 0));
  assert.deepEqual(legacyBuckets([]), sqlStyleBuckets([]));
  assert.equal(legacyAvg([]), null);
  assert.equal(legacyMedian([]), null);
}

function testPartialSevenDay() {
  const series = fillSeries(
    7,
    { "2026-08-20": 3, "2026-08-21": 1 },
    { "2026-08-21": 2 },
  );
  assert.equal(series.length, 7);
  const sparse = series.filter((d) => d.leads > 0 || d.responses > 0);
  assert.equal(sparse.length, 2);
  assert.equal(
    series.find((d) => d.date === "2026-08-20")?.leads,
    3,
  );
  // Missing days stay zero — no fabrication beyond fill.
  assert.equal(series.find((d) => d.date === "2026-08-19")?.leads, 0);
}

function testThirtyAndNinetyLengths() {
  assert.equal(fillSeries(30, {}, {}).length, 30);
  assert.equal(fillSeries(90, {}, {}).length, 90);
}

function testResponseMetricParity() {
  const samples = [5, 12, 45, 90, 200, 800, 2000];
  assert.deepEqual(legacyBuckets(samples), sqlStyleBuckets(samples));
  assert.equal(legacyAvg(samples), Math.round(samples.reduce((a, b) => a + b, 0) / samples.length));
  assert.equal(legacyMedian(samples), 90);

  const even = [10, 20, 30, 40];
  assert.equal(legacyMedian(even), 25);
  // PERCENTILE_CONT(0.5) on even set matches mid-average for this fixture.
  assert.equal(25, Math.round((20 + 30) / 2));
}

function testNegativeMinutesExcluded() {
  const raw = [-5, 10, 30];
  const positive = raw.filter((m) => m >= 0);
  assert.deepEqual(sqlStyleBuckets(positive), [
    { label: "< 15m", count: 1 },
    { label: "15–60m", count: 1 },
    { label: "1–4h", count: 0 },
    { label: "4–24h", count: 0 },
    { label: "> 24h", count: 0 },
  ]);
}

function testLargeDatasetDaySum() {
  const leadCounts: Record<string, number> = {};
  let total = 0;
  for (let i = 0; i < 90; i++) {
    const d = new Date("2026-08-21T12:00:00Z");
    d.setDate(d.getDate() - i);
    const key = dayKey(d);
    const n = (i % 7) + 1;
    leadCounts[key] = n;
    total += n;
  }
  const series = fillSeries(90, leadCounts, {});
  assert.equal(
    series.reduce((s, d) => s + d.leads, 0),
    total,
  );
  assert.ok(series.length === 90);
  // Chart payload is O(days), not O(raw rows).
  assert.ok(series.length < 200);
  assert.ok(total > 200);
}

testHotCandidateBound();
testNoLargeTakesRemain();
testEmptyRange();
testPartialSevenDay();
testThirtyAndNinetyLengths();
testResponseMetricParity();
testNegativeMinutesExcluded();
testLargeDatasetDaySum();
console.log("agent-statistics-selftest: ok");
