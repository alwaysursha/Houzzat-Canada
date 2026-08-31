/**
 * Stage 3K.5.32 — Selftest for StaffPullGesture classifier.
 * Run: pnpm staff-pull-gesture:selftest
 */

import assert from "node:assert/strict";
import {
  createInitialGestureState,
  evaluatePullMove,
  shouldCommitRefresh,
  STAFF_PULL_THRESHOLD_PX,
  STAFF_PULL_COOLDOWN_MS,
} from "../src/lib/mobile/staff-pull-gesture";

function testSmallMovementRejected() {
  const initial = createInitialGestureState(100, 100);
  const next = evaluatePullMove(initial, 103, 104);
  assert.equal(next.direction, "undetermined");
  assert.equal(next.pullPx, 0);
  assert.equal(next.armed, false);
  assert.equal(next.cancelled, false);
  assert.equal(shouldCommitRefresh(next, false, 0), false);
}

function testHorizontalMovementRejectedAndLocked() {
  const initial = createInitialGestureState(100, 100);
  // deltaX = 40, deltaY = 15 (horizontal swipe)
  const next = evaluatePullMove(initial, 140, 115);
  assert.equal(next.direction, "horizontal");
  assert.equal(next.cancelled, true);
  assert.equal(next.armed, false);
  assert.equal(next.pullPx, 0);
  assert.equal(shouldCommitRefresh(next, false, 0), false);

  // Subsequent move that looks downward must still be cancelled due to lock
  const subsequent = evaluatePullMove(next, 140, 350);
  assert.equal(subsequent.cancelled, true);
  assert.equal(subsequent.armed, false);
  assert.equal(subsequent.pullPx, 0);
  assert.equal(shouldCommitRefresh(subsequent, false, 0), false);
}

function testUpwardMovementRejected() {
  const initial = createInitialGestureState(100, 200);
  // deltaY = -50 (upward scroll)
  const next = evaluatePullMove(initial, 100, 150);
  assert.equal(next.direction, "upward");
  assert.equal(next.cancelled, true);
  assert.equal(next.armed, false);
  assert.equal(next.pullPx, 0);
  assert.equal(shouldCommitRefresh(next, false, 0), false);
}

function testScrollTopNonZeroCancelled() {
  const initial = createInitialGestureState(100, 100);
  // deltaY = 150, but page scrollTop is 10px
  const next = evaluatePullMove(initial, 100, 250, { scrollTop: 10 });
  assert.equal(next.cancelled, true);
  assert.equal(next.armed, false);
  assert.equal(next.pullPx, 0);
  assert.equal(shouldCommitRefresh(next, false, 0), false);
}

function testValidDownwardMovementBelowThreshold() {
  const initial = createInitialGestureState(100, 100);
  // deltaX = 2, deltaY = 80 -> pullPx = 40 (below 96 threshold)
  const next = evaluatePullMove(initial, 102, 180);
  assert.equal(next.direction, "vertical");
  assert.equal(next.cancelled, false);
  assert.equal(next.armed, false);
  assert.equal(next.pullPx, 40);
  assert.equal(shouldCommitRefresh(next, false, 0), false);
}

function testValidDownwardMovementAboveThreshold() {
  const initial = createInitialGestureState(100, 100);
  // deltaX = 5, deltaY = 220 -> pullPx = min(120, 110) = 110 (above 96 threshold)
  const next = evaluatePullMove(initial, 105, 320);
  assert.equal(next.direction, "vertical");
  assert.equal(next.cancelled, false);
  assert.equal(next.armed, true);
  assert.equal(next.pullPx, 110);
  assert.equal(shouldCommitRefresh(next, false, 0), true);
}

function testInFlightAndCooldownGuards() {
  const initial = createInitialGestureState(100, 100);
  const next = evaluatePullMove(initial, 100, 320);
  assert.equal(next.armed, true);

  // If already refreshing, do not commit
  assert.equal(shouldCommitRefresh(next, true, 0), false);

  // If refreshed 500ms ago (within 1500ms cooldown), do not commit
  const now = Date.now();
  assert.equal(shouldCommitRefresh(next, false, now - 500, now), false);

  // If refreshed 2000ms ago (after 1500ms cooldown), commit ok
  assert.equal(shouldCommitRefresh(next, false, now - 2000, now), true);
}

function runAll() {
  testSmallMovementRejected();
  testHorizontalMovementRejectedAndLocked();
  testUpwardMovementRejected();
  testScrollTopNonZeroCancelled();
  testValidDownwardMovementBelowThreshold();
  testValidDownwardMovementAboveThreshold();
  testInFlightAndCooldownGuards();
  console.log("staff-pull-gesture:selftest OK");
}

runAll();
