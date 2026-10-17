/**
 * Phase 3D.1 — email headshot geometry + mask selftest (hardened).
 * Run: pnpm email-headshot:selftest
 *
 * Hermetic. No DB. No network. No uploads. No Canvas required.
 * Geometry and software composition are tested independently of the browser renderer.
 *
 * Focused typecheck (scripts excluded from app tsconfig):
 *   pnpm exec tsc --noEmit --pretty false \
 *     --target ES2022 --module ESNext --moduleResolution bundler \
 *     --strict --skipLibCheck --esModuleInterop --resolveJsonModule \
 *     --types node --baseUrl . --paths '{"@/*":["src/*"]}' \
 *     scripts/email-headshot-selftest.ts src/lib/tenancy/branding-assets/email-headshot.ts
 */
import assert from "node:assert/strict";
import {
  EMAIL_HEADSHOT_DEFAULT_FOCUS_X,
  EMAIL_HEADSHOT_DEFAULT_TOP_PAD,
  EMAIL_HEADSHOT_MAX_EDGE,
  EMAIL_HEADSHOT_MAX_PIXELS,
  EMAIL_HEADSHOT_MIN_HEIGHT,
  EMAIL_HEADSHOT_MIN_WIDTH,
  EMAIL_HEADSHOT_SIZE,
  buildEmailHeadshotAlphaMask,
  circularMaskAlpha,
  composeEmailHeadshotRgba,
  createEmailHeadshotPng,
  focusFromPortraitUploader,
  isFiniteEmailHeadshotPlan,
  planEmailHeadshotCrop,
  type EmailHeadshotCropPlan,
  type EmailHeadshotFailure,
} from "@/lib/tenancy/branding-assets/email-headshot";

function section(name: string) {
  console.log(`  ✓ ${name}`);
}

function assertPlan(
  plan: ReturnType<typeof planEmailHeadshotCrop>,
): EmailHeadshotCropPlan {
  assert.equal(plan.ok, true, "expected crop plan ok");
  if (!plan.ok) throw new Error("unreachable");
  assert.equal(isFiniteEmailHeadshotPlan(plan), true, "success plan must be finite");
  return plan;
}

function assertFail(
  plan: ReturnType<typeof planEmailHeadshotCrop>,
  code?: EmailHeadshotFailure["code"],
): EmailHeadshotFailure {
  assert.equal(plan.ok, false, "expected failure");
  if (plan.ok) throw new Error("unreachable");
  if (code) assert.equal(plan.code, code);
  return plan;
}

function solidReader(color: { r: number; g: number; b: number }) {
  return () => color;
}

function gradientReader(width: number, height: number) {
  return (x: number, y: number) => ({
    r: Math.round((x / Math.max(1, width - 1)) * 255),
    g: Math.round((y / Math.max(1, height - 1)) * 255),
    b: 128,
    a: 255,
  });
}

function isFocusFailure(
  value: ReturnType<typeof focusFromPortraitUploader>,
): value is EmailHeadshotFailure {
  return "ok" in value && value.ok === false;
}

// ---------------------------------------------------------------------------
// Standard 3:4 portrait (uploader export size)
// ---------------------------------------------------------------------------
{
  const plan = assertPlan(
    planEmailHeadshotCrop({
      sourceWidth: 1200,
      sourceHeight: 1600,
    }),
  );
  assert.equal(plan.outputSize, EMAIL_HEADSHOT_SIZE);
  assert.equal(plan.side, 1200);
  assert.equal(plan.padTop, Math.round(1600 * EMAIL_HEADSHOT_DEFAULT_TOP_PAD));
  assert.equal(plan.scale, EMAIL_HEADSHOT_SIZE / plan.side);
  assert.ok(plan.cropX >= 0 && plan.cropX + plan.side <= 1200);
  assert.ok(plan.cropY >= 0 && plan.cropY + plan.side <= 1600 + plan.padTop);
  assert.equal(plan.scale * plan.side, EMAIL_HEADSHOT_SIZE);
  section("Standard 3:4 portrait (1200×1600)");
}

// ---------------------------------------------------------------------------
// Square portrait
// ---------------------------------------------------------------------------
{
  const plan = assertPlan(
    planEmailHeadshotCrop({ sourceWidth: 800, sourceHeight: 800 }),
  );
  assert.equal(plan.side, 800);
  assert.ok(plan.padTop > 0);
  assert.equal(plan.cropX, 0);
  section("Square portrait");
}

// ---------------------------------------------------------------------------
// Landscape portrait
// ---------------------------------------------------------------------------
{
  const plan = assertPlan(
    planEmailHeadshotCrop({
      sourceWidth: 1600,
      sourceHeight: 900,
      focusX: 0.5,
      focusY: 0.4,
    }),
  );
  assert.ok(plan.side <= 900 + plan.padTop);
  assert.ok(plan.side <= 1600);
  assert.ok(plan.cropX + plan.side <= 1600);
  const left = assertPlan(
    planEmailHeadshotCrop({
      sourceWidth: 1600,
      sourceHeight: 900,
      focusX: 0.2,
      focusY: 0.4,
    }),
  );
  const right = assertPlan(
    planEmailHeadshotCrop({
      sourceWidth: 1600,
      sourceHeight: 900,
      focusX: 0.8,
      focusY: 0.4,
    }),
  );
  assert.ok(left.cropX < right.cropX, "horizontal focus should shift cropX");
  section("Landscape portrait + horizontal focus");
}

// ---------------------------------------------------------------------------
// Limited headroom — use supported `headroom` API (not stale outputFocusY)
// ---------------------------------------------------------------------------
{
  const tight = assertPlan(
    planEmailHeadshotCrop({
      sourceWidth: 1200,
      sourceHeight: 1600,
      focusY: 0.35,
      topPadFraction: 0.07,
      headroom: 0.08,
    }),
  );
  assert.ok(tight.padTop >= Math.round(1600 * 0.06));
  assert.ok(tight.cropY < tight.padTop, "expected some pad inside the square");
  const headroomPct = (tight.headroomPx / tight.side) * 100;
  assert.ok(
    headroomPct >= 3,
    `expected measurable pad-in-frame headroom, got ${headroomPct.toFixed(1)}%`,
  );
  section("Portrait with limited headroom (pad-in-frame)");
}

// ---------------------------------------------------------------------------
// Adjustable vertical focus
// ---------------------------------------------------------------------------
{
  const high = assertPlan(
    planEmailHeadshotCrop({
      sourceWidth: 1200,
      sourceHeight: 1600,
      focusY: 0.25,
    }),
  );
  const low = assertPlan(
    planEmailHeadshotCrop({
      sourceWidth: 1200,
      sourceHeight: 1600,
      focusY: 0.55,
    }),
  );
  // Higher focusY nudges crop down (more shoulders) → larger cropY.
  assert.ok(high.cropY < low.cropY, "higher focusY should increase cropY");
  section("Adjustable vertical focus");
}

// ---------------------------------------------------------------------------
// Adjustable horizontal focus
// ---------------------------------------------------------------------------
{
  const left = assertPlan(
    planEmailHeadshotCrop({
      sourceWidth: 1800,
      sourceHeight: 1200,
      focusX: 0.25,
      focusY: 0.4,
    }),
  );
  const right = assertPlan(
    planEmailHeadshotCrop({
      sourceWidth: 1800,
      sourceHeight: 1200,
      focusX: 0.75,
      focusY: 0.4,
    }),
  );
  assert.ok(left.cropX < right.cropX);
  assert.notEqual(left.cropX, right.cropX);
  section("Adjustable horizontal focus");
}

// ---------------------------------------------------------------------------
// Focus boundaries 0 and 1
// ---------------------------------------------------------------------------
{
  const left = assertPlan(
    planEmailHeadshotCrop({
      sourceWidth: 1800,
      sourceHeight: 1200,
      focusX: 0,
      focusY: 0.5,
    }),
  );
  const right = assertPlan(
    planEmailHeadshotCrop({
      sourceWidth: 1800,
      sourceHeight: 1200,
      focusX: 1,
      focusY: 0.5,
    }),
  );
  assert.equal(left.focusX, 0);
  assert.equal(right.focusX, 1);
  assert.equal(left.cropX, 0);
  assert.equal(right.cropX, 1800 - right.side);

  const top = assertPlan(
    planEmailHeadshotCrop({
      sourceWidth: 1200,
      sourceHeight: 1600,
      focusY: 0,
    }),
  );
  const bottom = assertPlan(
    planEmailHeadshotCrop({
      sourceWidth: 1200,
      sourceHeight: 1600,
      focusY: 1,
    }),
  );
  assert.equal(top.focusY, 0);
  assert.equal(bottom.focusY, 1);
  assert.ok(top.cropY <= bottom.cropY);
  section("Focus boundaries 0 and 1");
}

// ---------------------------------------------------------------------------
// Extreme aspect ratios
// ---------------------------------------------------------------------------
{
  const ultraWide = assertPlan(
    planEmailHeadshotCrop({ sourceWidth: 4000, sourceHeight: 100 }),
  );
  assert.ok(ultraWide.side <= 100 + ultraWide.padTop);
  assert.ok(ultraWide.cropX + ultraWide.side <= 4000);

  const ultraTall = assertPlan(
    planEmailHeadshotCrop({ sourceWidth: 100, sourceHeight: 4000 }),
  );
  assert.equal(ultraTall.side, 100);
  assert.ok(ultraTall.cropY + ultraTall.side <= 4000 + ultraTall.padTop);
  section("Extreme aspect ratios");
}

// ---------------------------------------------------------------------------
// No stretching — scale is uniform; output maps square→240 only
// ---------------------------------------------------------------------------
{
  const plan = assertPlan(
    planEmailHeadshotCrop({ sourceWidth: 1200, sourceHeight: 1600 }),
  );
  assert.equal(plan.scale, plan.outputSize / plan.side);
  const rgba = composeEmailHeadshotRgba({
    plan,
    readSource: gradientReader(1200, 1600),
  });
  assert.equal(rgba.length, EMAIL_HEADSHOT_SIZE * EMAIL_HEADSHOT_SIZE * 4);
  section("No stretching + correct RGBA buffer dimensions");
}

// ---------------------------------------------------------------------------
// Correct output dimensions constant
// ---------------------------------------------------------------------------
{
  assert.equal(EMAIL_HEADSHOT_SIZE, 240);
  const plan = assertPlan(
    planEmailHeadshotCrop({ sourceWidth: 400, sourceHeight: 500 }),
  );
  assert.equal(plan.outputSize, 240);
  section("Correct output dimensions (240×240)");
}

// ---------------------------------------------------------------------------
// Transparent circular corners
// ---------------------------------------------------------------------------
{
  const mask = buildEmailHeadshotAlphaMask(EMAIL_HEADSHOT_SIZE);
  assert.equal(mask.length, EMAIL_HEADSHOT_SIZE * EMAIL_HEADSHOT_SIZE);
  assert.equal(mask[0], 0, "top-left corner transparent");
  assert.equal(mask[EMAIL_HEADSHOT_SIZE - 1], 0, "top-right transparent");
  assert.equal(
    mask[(EMAIL_HEADSHOT_SIZE - 1) * EMAIL_HEADSHOT_SIZE],
    0,
    "bottom-left transparent",
  );
  assert.equal(
    mask[EMAIL_HEADSHOT_SIZE * EMAIL_HEADSHOT_SIZE - 1],
    0,
    "bottom-right transparent",
  );
  const center =
    mask[
      Math.floor(EMAIL_HEADSHOT_SIZE / 2) * EMAIL_HEADSHOT_SIZE +
        Math.floor(EMAIL_HEADSHOT_SIZE / 2)
    ]!;
  assert.equal(center, 255, "center fully opaque");

  const plan = assertPlan(
    planEmailHeadshotCrop({ sourceWidth: 400, sourceHeight: 500 }),
  );
  const rgba = composeEmailHeadshotRgba({
    plan,
    readSource: solidReader({ r: 10, g: 20, b: 30 }),
  });
  for (const [x, y] of [
    [0, 0],
    [239, 0],
    [0, 239],
    [239, 239],
  ] as const) {
    const i = (y * EMAIL_HEADSHOT_SIZE + x) * 4;
    assert.equal(rgba[i + 3], 0, `corner (${x},${y}) alpha`);
  }
  const ci = (120 * EMAIL_HEADSHOT_SIZE + 120) * 4;
  assert.ok((rgba[ci + 3] ?? 0) > 200, "center alpha near opaque");
  assert.ok(circularMaskAlpha(0, 0) === 0);
  assert.ok(circularMaskAlpha(120, 120) === 255);
  section("Transparent circular corners");
}

// ---------------------------------------------------------------------------
// Invalid dimensions
// ---------------------------------------------------------------------------
{
  const cases: Array<{ w: number; h: number; label: string }> = [
    { w: 0, h: 100, label: "zero width" },
    { w: 100, h: 0, label: "zero height" },
    { w: -10, h: 100, label: "negative width" },
    { w: 100, h: -10, label: "negative height" },
    { w: 10, h: 10, label: "below minimum" },
    { w: 1.5, h: 100, label: "non-integer width" },
    { w: Number.NaN, h: 100, label: "NaN" },
    { w: Number.POSITIVE_INFINITY, h: 100, label: "Infinity width" },
  ];
  for (const c of cases) {
    assertFail(
      planEmailHeadshotCrop({ sourceWidth: c.w, sourceHeight: c.h }),
      "INVALID_DIMENSIONS",
    );
  }
  assert.ok(EMAIL_HEADSHOT_MIN_WIDTH >= 1 && EMAIL_HEADSHOT_MIN_HEIGHT >= 1);
  section("Invalid dimensions");
}

// ---------------------------------------------------------------------------
// Non-finite optional numerics — fail closed (never ok:true with NaN geometry)
// ---------------------------------------------------------------------------
{
  assertFail(
    planEmailHeadshotCrop({
      sourceWidth: 1200,
      sourceHeight: 1600,
      focusX: Number.NaN,
    }),
    "INVALID_DIMENSIONS",
  );
  assertFail(
    planEmailHeadshotCrop({
      sourceWidth: 1200,
      sourceHeight: 1600,
      focusY: Number.NaN,
    }),
    "INVALID_DIMENSIONS",
  );
  assertFail(
    planEmailHeadshotCrop({
      sourceWidth: 1200,
      sourceHeight: 1600,
      focusX: Number.POSITIVE_INFINITY,
    }),
    "INVALID_DIMENSIONS",
  );
  assertFail(
    planEmailHeadshotCrop({
      sourceWidth: 1200,
      sourceHeight: 1600,
      focusY: Number.NEGATIVE_INFINITY,
    }),
    "INVALID_DIMENSIONS",
  );
  assertFail(
    planEmailHeadshotCrop({
      sourceWidth: 1200,
      sourceHeight: 1600,
      headroom: Number.NaN,
    }),
    "INVALID_DIMENSIONS",
  );
  assertFail(
    planEmailHeadshotCrop({
      sourceWidth: 1200,
      sourceHeight: 1600,
      headroom: Number.POSITIVE_INFINITY,
    }),
    "INVALID_DIMENSIONS",
  );
  assertFail(
    planEmailHeadshotCrop({
      sourceWidth: 1200,
      sourceHeight: 1600,
      topPadFraction: Number.NaN,
    }),
    "INVALID_DIMENSIONS",
  );
  assertFail(
    planEmailHeadshotCrop({
      sourceWidth: 1200,
      sourceHeight: 1600,
      topPadFraction: Number.POSITIVE_INFINITY,
    }),
    "INVALID_DIMENSIONS",
  );
  section("NaN/Infinity optional numerics fail closed");
}

// ---------------------------------------------------------------------------
// Oversized dimensions
// ---------------------------------------------------------------------------
{
  assertFail(
    planEmailHeadshotCrop({
      sourceWidth: EMAIL_HEADSHOT_MAX_EDGE + 1,
      sourceHeight: 1000,
    }),
    "IMAGE_TOO_LARGE",
  );
  assertFail(
    planEmailHeadshotCrop({
      sourceWidth: 1000,
      sourceHeight: EMAIL_HEADSHOT_MAX_EDGE + 1,
    }),
    "IMAGE_TOO_LARGE",
  );
  // Pixel budget: just over MAX_PIXELS while each edge is within MAX_EDGE.
  // 8192 * 2049 = 16_777_216 + 8192 > MAX when MAX is 16_777_216.
  const wide = Math.min(EMAIL_HEADSHOT_MAX_EDGE, 8192);
  const tall = Math.floor(EMAIL_HEADSHOT_MAX_PIXELS / wide) + 1;
  if (tall <= EMAIL_HEADSHOT_MAX_EDGE && wide * tall > EMAIL_HEADSHOT_MAX_PIXELS) {
    assertFail(
      planEmailHeadshotCrop({ sourceWidth: wide, sourceHeight: tall }),
      "IMAGE_TOO_LARGE",
    );
  }
  // At the limit should still succeed when within both caps.
  const okEdge = assertPlan(
    planEmailHeadshotCrop({
      sourceWidth: 4096,
      sourceHeight: 4096,
    }),
  );
  assert.equal(isFiniteEmailHeadshotPlan(okEdge), true);
  section("Oversized dimensions");
}

// ---------------------------------------------------------------------------
// Defaults are agent-agnostic
// ---------------------------------------------------------------------------
{
  const a = assertPlan(
    planEmailHeadshotCrop({ sourceWidth: 1200, sourceHeight: 1600 }),
  );
  const b = assertPlan(
    planEmailHeadshotCrop({
      sourceWidth: 1200,
      sourceHeight: 1600,
      focusX: EMAIL_HEADSHOT_DEFAULT_FOCUS_X,
      topPadFraction: EMAIL_HEADSHOT_DEFAULT_TOP_PAD,
    }),
  );
  assert.deepEqual(
    {
      cropX: a.cropX,
      cropY: a.cropY,
      side: a.side,
      padTop: a.padTop,
    },
    {
      cropX: b.cropX,
      cropY: b.cropY,
      side: b.side,
      padTop: b.padTop,
    },
  );
  section("Defaults are configurable / agent-agnostic");
}

async function main() {
  // ---------------------------------------------------------------------------
  // Processing failure fallback (Canvas unavailable in Node)
  // ---------------------------------------------------------------------------
  {
    const fakeImage = {
      width: 1200,
      height: 1600,
      naturalWidth: 1200,
      naturalHeight: 1600,
    } as unknown as CanvasImageSource;

    const result = await createEmailHeadshotPng(fakeImage);
    assert.equal(result.ok, false, "Node has no Canvas — expect safe failure");
    if (!result.ok) {
      assert.ok(
        result.code === "CANVAS_UNAVAILABLE" ||
          result.code === "RENDER_FAILED" ||
          result.code === "INVALID_DIMENSIONS" ||
          result.code === "IMAGE_TOO_LARGE" ||
          result.code === "EXPORT_FAILED",
      );
      assert.ok(result.message.length > 0);
    }
    section("Processing failure fallback (no Canvas in Node)");
  }

  // ---------------------------------------------------------------------------
  // Renderer rejects oversized override dimensions before Canvas work
  // ---------------------------------------------------------------------------
  {
    const fakeImage = {
      width: 100,
      height: 100,
      naturalWidth: 100,
      naturalHeight: 100,
    } as unknown as CanvasImageSource;
    const result = await createEmailHeadshotPng(fakeImage, {
      sourceWidth: EMAIL_HEADSHOT_MAX_EDGE + 1,
      sourceHeight: 1024,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "IMAGE_TOO_LARGE");
    }
    section("Renderer oversized override → IMAGE_TOO_LARGE");
  }

  // ---------------------------------------------------------------------------
  // Uploader focus mapping + non-finite offsets
  // ---------------------------------------------------------------------------
  {
    const focused = focusFromPortraitUploader({
      naturalWidth: 3000,
      naturalHeight: 4000,
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
      frameWidth: 300,
      frameHeight: 400,
    });
    assert.equal(isFocusFailure(focused), false);
    if (isFocusFailure(focused)) throw new Error("unreachable");
    assert.ok(focused.focusX > 0.4 && focused.focusX < 0.6);
    assert.ok(focused.focusY > 0.4 && focused.focusY < 0.6);
    assert.ok(Number.isFinite(focused.focusX));
    assert.ok(Number.isFinite(focused.focusY));

    const panned = focusFromPortraitUploader({
      naturalWidth: 3000,
      naturalHeight: 4000,
      zoom: 1.2,
      offsetX: 40,
      offsetY: -30,
      frameWidth: 300,
      frameHeight: 400,
    });
    assert.equal(isFocusFailure(panned), false);
    if (isFocusFailure(panned)) throw new Error("unreachable");
    assert.notEqual(panned.focusX, focused.focusX);

    assert.equal(
      isFocusFailure(
        focusFromPortraitUploader({
          naturalWidth: 0,
          naturalHeight: 4000,
          zoom: 1,
          offsetX: 0,
          offsetY: 0,
          frameWidth: 300,
          frameHeight: 400,
        }),
      ),
      true,
    );

    for (const offsets of [
      { offsetX: Number.NaN, offsetY: 0 },
      { offsetX: 0, offsetY: Number.NaN },
      { offsetX: Number.POSITIVE_INFINITY, offsetY: 0 },
      { offsetX: 0, offsetY: Number.NEGATIVE_INFINITY },
    ]) {
      const bad = focusFromPortraitUploader({
        naturalWidth: 3000,
        naturalHeight: 4000,
        zoom: 1,
        frameWidth: 300,
        frameHeight: 400,
        ...offsets,
      });
      assert.equal(isFocusFailure(bad), true, `offsets ${JSON.stringify(offsets)}`);
      if (isFocusFailure(bad)) {
        assert.equal(bad.code, "INVALID_DIMENSIONS");
      }
    }
    section("Uploader focus mapping + non-finite offsets");
  }

  console.log("\nemail-headshot selftest: OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
