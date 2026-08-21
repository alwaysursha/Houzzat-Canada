import assert from "node:assert/strict";
import {
  __resetMobileSearchSheetForTests,
  isMobileSearchSheetOpen,
  registerMobileSearchSheet,
  requestCloseMobileSearchSheet,
} from "../src/lib/mobile/mobile-search-sheet";

function testRegisterCloseUnregister() {
  __resetMobileSearchSheetForTests();
  assert.equal(isMobileSearchSheetOpen(), false);
  assert.equal(requestCloseMobileSearchSheet(), false);

  let closed = 0;
  const unregister = registerMobileSearchSheet(() => {
    closed += 1;
  });
  assert.equal(isMobileSearchSheetOpen(), true);
  assert.equal(requestCloseMobileSearchSheet(), true);
  assert.equal(closed, 1);

  unregister();
  assert.equal(isMobileSearchSheetOpen(), false);
  assert.equal(requestCloseMobileSearchSheet(), false);
}

function testLIFOMultipleSheets() {
  __resetMobileSearchSheetForTests();
  const order: string[] = [];
  const u1 = registerMobileSearchSheet(() => {
    order.push("a");
  });
  const u2 = registerMobileSearchSheet(() => {
    order.push("b");
  });
  assert.equal(requestCloseMobileSearchSheet(), true);
  assert.deepEqual(order, ["b"]);
  u2();
  assert.equal(requestCloseMobileSearchSheet(), true);
  assert.deepEqual(order, ["b", "a"]);
  u1();
  assert.equal(isMobileSearchSheetOpen(), false);
}

function testNoListenerAccumulation() {
  __resetMobileSearchSheetForTests();
  for (let i = 0; i < 10; i += 1) {
    const unregister = registerMobileSearchSheet(() => undefined);
    unregister();
  }
  assert.equal(isMobileSearchSheetOpen(), false);
  assert.equal(requestCloseMobileSearchSheet(), false);
}

testRegisterCloseUnregister();
testLIFOMultipleSheets();
testNoListenerAccumulation();
console.log("mobile-search-back-selftest: ok");
