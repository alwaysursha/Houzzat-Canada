/**
 * Phase 3D.1 — reusable email headshot geometry + browser Canvas renderer.
 *
 * Produces 240×240 circular PNGs with transparent corners for email signatures.
 * Pure crop planning is Node-testable; rendering uses browser Canvas APIs
 * (same family as AgentPortraitFocusUploader). No sharp / no face ML / no I/O.
 *
 * Does not touch User.image, R2, or signature HTML — storage wiring is later.
 *
 * Numeric policy (fail-closed):
 * - Source dimensions must be positive finite integers within max edge/pixels.
 * - Optional focus/headroom/pad values, when provided, must be finite; otherwise
 *   INVALID_DIMENSIONS. Undefined → documented defaults.
 * - Success plans never contain non-finite crop geometry.
 */

export const EMAIL_HEADSHOT_SIZE = 240;
export const EMAIL_HEADSHOT_MIME = "image/png" as const;
export const EMAIL_HEADSHOT_FILENAME = "agent-email-headshot-240.png";

/** Default artificial top pad as a fraction of source height (Phase 3C band). */
export const EMAIL_HEADSHOT_DEFAULT_TOP_PAD = 0.06;
/**
 * Default clear space at the top of the square as a fraction of side
 * (Phase 3C balanced ≈ 6–10%).
 */
export const EMAIL_HEADSHOT_DEFAULT_HEADROOM = 0.08;
/** Default horizontal focus in source (0.5 = centered). */
export const EMAIL_HEADSHOT_DEFAULT_FOCUS_X = 0.5;
/**
 * Default vertical focus in source (0–1). Used as the neutral point for
 * vertical nudges; 0.5 means “no extra shift” relative to headroom anchoring.
 */
export const EMAIL_HEADSHOT_DEFAULT_FOCUS_Y = 0.5;
/** Soft minimums — below this we refuse rather than upscale junk. */
export const EMAIL_HEADSHOT_MIN_WIDTH = 32;
export const EMAIL_HEADSHOT_MIN_HEIGHT = 32;
/**
 * Max edge length (px) accepted for planning/rendering.
 * Above this, reject rather than allocate oversized canvases.
 */
export const EMAIL_HEADSHOT_MAX_EDGE = 8192;
/**
 * Max source pixel count (width × height). ~16MP keeps Canvas memory bounded.
 * 1200×1600 uploader exports (~1.9MP) are well under this.
 */
export const EMAIL_HEADSHOT_MAX_PIXELS = 16_777_216;
/** Small canvas used only to sample top-edge pad color (never full-res). */
export const EMAIL_HEADSHOT_PAD_SAMPLE_WIDTH = 64;
export const EMAIL_HEADSHOT_PAD_SAMPLE_HEIGHT = 8;

const AA_FACTOR = 4;
/** Working supersample canvas is always EMAIL_HEADSHOT_SIZE * AA_FACTOR. */
const WORK_CANVAS_EDGE = EMAIL_HEADSHOT_SIZE * AA_FACTOR;

export type EmailHeadshotErrorCode =
  | "INVALID_DIMENSIONS"
  | "IMAGE_TOO_LARGE"
  | "CANVAS_UNAVAILABLE"
  | "RENDER_FAILED"
  | "EXPORT_FAILED";

export type EmailHeadshotFailure = {
  ok: false;
  code: EmailHeadshotErrorCode;
  message: string;
};

export type EmailHeadshotCropPlan = {
  ok: true;
  sourceWidth: number;
  sourceHeight: number;
  /** Artificial pad above the source, in source pixels. */
  padTop: number;
  /** Square side length in the padded coordinate space. */
  side: number;
  /** Crop origin X in source pixels (no horizontal pad). */
  cropX: number;
  /** Crop origin Y in padded coordinates (0 = top of pad). */
  cropY: number;
  /** Uniform scale from square → output (never independent X/Y scales). */
  scale: number;
  outputSize: typeof EMAIL_HEADSHOT_SIZE;
  focusX: number;
  focusY: number;
  headroom: number;
  topPadFraction: number;
  /** Approximate pad/clear pixels retained at top of the square (≥ 0). */
  headroomPx: number;
};

export type EmailHeadshotPlanResult = EmailHeadshotCropPlan | EmailHeadshotFailure;

export type EmailHeadshotPlanInput = {
  sourceWidth: number;
  sourceHeight: number;
  /**
   * Horizontal subject focus in source image, 0–1 (0 = left, 1 = right).
   * Defaults to center. When provided, must be finite.
   */
  focusX?: number;
  /**
   * Vertical subject focus in source image, 0–1 (0 = top, 1 = bottom).
   * Values above {@link EMAIL_HEADSHOT_DEFAULT_FOCUS_Y} shift the crop down
   * (more shoulders); values below shift up (more headroom, clamped).
   * When provided, must be finite.
   */
  focusY?: number;
  /**
   * Target clear space at the top of the square as a fraction of side
   * (clamped 0–0.2). Defaults to {@link EMAIL_HEADSHOT_DEFAULT_HEADROOM}.
   * When provided, must be finite.
   */
  headroom?: number;
  /**
   * Artificial top pad as a fraction of source height (clamped 0–0.2).
   * Adds breathing room when native headroom is tight.
   * When provided, must be finite.
   */
  topPadFraction?: number;
};

export type EmailHeadshotRenderOptions = Omit<
  EmailHeadshotPlanInput,
  "sourceWidth" | "sourceHeight"
> & {
  /** Override detected natural size when the source reports 0 (rare). */
  sourceWidth?: number;
  sourceHeight?: number;
};

export type EmailHeadshotSuccess = {
  ok: true;
  blob: Blob;
  width: typeof EMAIL_HEADSHOT_SIZE;
  height: typeof EMAIL_HEADSHOT_SIZE;
  mime: typeof EMAIL_HEADSHOT_MIME;
  filename: typeof EMAIL_HEADSHOT_FILENAME;
  plan: EmailHeadshotCropPlan;
};

export type EmailHeadshotResult = EmailHeadshotSuccess | EmailHeadshotFailure;

export type PortraitUploaderFocusInput = {
  naturalWidth: number;
  naturalHeight: number;
  /** Zoom relative to cover scale (1 = cover). */
  zoom: number;
  /** Pan offsets in CSS pixels inside the stage (same as uploader Draft). */
  offsetX: number;
  offsetY: number;
  frameWidth: number;
  frameHeight: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositiveFinite(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function failure(
  code: EmailHeadshotErrorCode,
  message: string,
): EmailHeadshotFailure {
  return { ok: false, code, message };
}

/**
 * Resolve an optional numeric option: undefined → fallback; non-finite → fail.
 */
function resolveOptionalFinite(
  value: number | undefined,
  fallback: number,
  label: string,
): number | EmailHeadshotFailure {
  if (value === undefined) return fallback;
  if (!isFiniteNumber(value)) {
    return failure(
      "INVALID_DIMENSIONS",
      `${label} must be a finite number when provided.`,
    );
  }
  return value;
}

function validateSourceDimensions(
  sourceWidth: number,
  sourceHeight: number,
): EmailHeadshotFailure | null {
  if (
    !isPositiveFinite(sourceWidth) ||
    !isPositiveFinite(sourceHeight) ||
    !Number.isInteger(sourceWidth) ||
    !Number.isInteger(sourceHeight)
  ) {
    return failure(
      "INVALID_DIMENSIONS",
      "Source width and height must be positive integers.",
    );
  }

  if (
    sourceWidth < EMAIL_HEADSHOT_MIN_WIDTH ||
    sourceHeight < EMAIL_HEADSHOT_MIN_HEIGHT
  ) {
    return failure(
      "INVALID_DIMENSIONS",
      `Source must be at least ${EMAIL_HEADSHOT_MIN_WIDTH}×${EMAIL_HEADSHOT_MIN_HEIGHT}px.`,
    );
  }

  if (
    sourceWidth > EMAIL_HEADSHOT_MAX_EDGE ||
    sourceHeight > EMAIL_HEADSHOT_MAX_EDGE
  ) {
    return failure(
      "IMAGE_TOO_LARGE",
      `Source edge must be at most ${EMAIL_HEADSHOT_MAX_EDGE}px.`,
    );
  }

  const pixels = sourceWidth * sourceHeight;
  if (!isPositiveFinite(pixels) || pixels > EMAIL_HEADSHOT_MAX_PIXELS) {
    return failure(
      "IMAGE_TOO_LARGE",
      `Source must be at most ${EMAIL_HEADSHOT_MAX_PIXELS} pixels.`,
    );
  }

  return null;
}

/** True when every numeric field on a success plan is finite. */
export function isFiniteEmailHeadshotPlan(
  plan: EmailHeadshotCropPlan,
): boolean {
  return (
    plan.ok === true &&
    isFiniteNumber(plan.sourceWidth) &&
    isFiniteNumber(plan.sourceHeight) &&
    isFiniteNumber(plan.padTop) &&
    isFiniteNumber(plan.side) &&
    isFiniteNumber(plan.cropX) &&
    isFiniteNumber(plan.cropY) &&
    isFiniteNumber(plan.scale) &&
    isFiniteNumber(plan.outputSize) &&
    isFiniteNumber(plan.focusX) &&
    isFiniteNumber(plan.focusY) &&
    isFiniteNumber(plan.headroom) &&
    isFiniteNumber(plan.topPadFraction) &&
    isFiniteNumber(plan.headroomPx) &&
    plan.side > 0 &&
    plan.scale > 0
  );
}

/**
 * Map AgentPortraitFocusUploader draft pan/zoom into normalized focus
 * coordinates in the natural image (0–1). Safe to call from the uploader later.
 */
export function focusFromPortraitUploader(
  input: PortraitUploaderFocusInput,
): { focusX: number; focusY: number } | EmailHeadshotFailure {
  const {
    naturalWidth,
    naturalHeight,
    zoom,
    offsetX,
    offsetY,
    frameWidth,
    frameHeight,
  } = input;

  if (
    !isPositiveFinite(naturalWidth) ||
    !isPositiveFinite(naturalHeight) ||
    !isPositiveFinite(frameWidth) ||
    !isPositiveFinite(frameHeight) ||
    !isPositiveFinite(zoom)
  ) {
    return failure(
      "INVALID_DIMENSIONS",
      "Portrait focus requires positive finite dimensions and zoom.",
    );
  }

  if (!isFiniteNumber(offsetX) || !isFiniteNumber(offsetY)) {
    return failure(
      "INVALID_DIMENSIONS",
      "Portrait focus offsets must be finite numbers.",
    );
  }

  const cover = Math.max(
    frameWidth / naturalWidth,
    frameHeight / naturalHeight,
  );
  const scale = cover * zoom;
  if (!isPositiveFinite(scale)) {
    return failure("INVALID_DIMENSIONS", "Portrait focus scale is invalid.");
  }

  const drawnW = naturalWidth * scale;
  const drawnH = naturalHeight * scale;
  const left = (frameWidth - drawnW) / 2 + offsetX;
  const top = (frameHeight - drawnH) / 2 + offsetY;

  if (!isFiniteNumber(left) || !isFiniteNumber(top)) {
    return failure(
      "INVALID_DIMENSIONS",
      "Portrait focus pan produced non-finite coordinates.",
    );
  }

  const sx = -left / scale;
  const sy = -top / scale;
  const sw = frameWidth / scale;
  const sh = frameHeight / scale;

  const focusX = clamp01((sx + sw / 2) / naturalWidth);
  const focusY = clamp01((sy + sh / 2) / naturalHeight);

  if (!isFiniteNumber(focusX) || !isFiniteNumber(focusY)) {
    return failure(
      "INVALID_DIMENSIONS",
      "Portrait focus mapping produced non-finite focus.",
    );
  }

  return { focusX, focusY };
}

/**
 * Deterministic square crop plan in a top-padded coordinate space.
 * Uniform scale only — never stretches.
 *
 * Vertical anchoring: keep ~headroom of the square as clear/pad at the top,
 * then nudge with focusY. Horizontal anchoring: center on focusX.
 */
export function planEmailHeadshotCrop(
  input: EmailHeadshotPlanInput,
): EmailHeadshotPlanResult {
  const dimError = validateSourceDimensions(
    input.sourceWidth,
    input.sourceHeight,
  );
  if (dimError) return dimError;

  const sourceWidth = input.sourceWidth;
  const sourceHeight = input.sourceHeight;

  const focusXRaw = resolveOptionalFinite(
    input.focusX,
    EMAIL_HEADSHOT_DEFAULT_FOCUS_X,
    "focusX",
  );
  if (typeof focusXRaw !== "number") return focusXRaw;

  const focusYRaw = resolveOptionalFinite(
    input.focusY,
    EMAIL_HEADSHOT_DEFAULT_FOCUS_Y,
    "focusY",
  );
  if (typeof focusYRaw !== "number") return focusYRaw;

  const headroomRaw = resolveOptionalFinite(
    input.headroom,
    EMAIL_HEADSHOT_DEFAULT_HEADROOM,
    "headroom",
  );
  if (typeof headroomRaw !== "number") return headroomRaw;

  const topPadRaw = resolveOptionalFinite(
    input.topPadFraction,
    EMAIL_HEADSHOT_DEFAULT_TOP_PAD,
    "topPadFraction",
  );
  if (typeof topPadRaw !== "number") return topPadRaw;

  const focusX = clamp01(focusXRaw);
  const focusY = clamp01(focusYRaw);
  const headroom = clamp(headroomRaw, 0, 0.2);
  const topPadFraction = clamp(topPadRaw, 0, 0.2);

  const padTop = Math.round(sourceHeight * topPadFraction);
  const paddedHeight = sourceHeight + padTop;
  const side = Math.min(sourceWidth, paddedHeight);
  if (!isPositiveFinite(side) || side < EMAIL_HEADSHOT_MIN_WIDTH) {
    return failure(
      "INVALID_DIMENSIONS",
      "Crop square is too small after padding.",
    );
  }

  const focusSourceX = focusX * sourceWidth;
  let cropX = Math.round(focusSourceX - side / 2);
  cropX = clamp(cropX, 0, Math.max(0, sourceWidth - side));

  // Headroom-first vertical anchor, then focusY nudge (positive = more shoulders).
  const headroomTargetPx = headroom * side;
  let cropY = Math.round(padTop - headroomTargetPx);
  const focusNudge = Math.round(
    (focusY - EMAIL_HEADSHOT_DEFAULT_FOCUS_Y) * side,
  );
  cropY += focusNudge;
  cropY = clamp(cropY, 0, Math.max(0, paddedHeight - side));

  const headroomPx = Math.max(0, padTop - cropY);
  const scale = EMAIL_HEADSHOT_SIZE / side;

  const plan: EmailHeadshotCropPlan = {
    ok: true,
    sourceWidth,
    sourceHeight,
    padTop,
    side,
    cropX,
    cropY,
    scale,
    outputSize: EMAIL_HEADSHOT_SIZE,
    focusX,
    focusY,
    headroom,
    topPadFraction,
    headroomPx,
  };

  if (!isFiniteEmailHeadshotPlan(plan)) {
    return failure(
      "INVALID_DIMENSIONS",
      "Crop geometry produced non-finite values.",
    );
  }

  return plan;
}

/**
 * Coverage alpha for a pixel center in a size×size circular mask.
 * Soft 1.5px edge for antialiasing without a supersampled canvas.
 */
export function circularMaskAlpha(
  px: number,
  py: number,
  size: number = EMAIL_HEADSHOT_SIZE,
): number {
  if (!isPositiveFinite(size) || size < 1) return 0;
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const radius = size / 2 - 0.5;
  const distance = Math.hypot(px - cx, py - cy);
  if (!isFiniteNumber(distance)) return 0;
  const soft = 0.75;
  if (distance <= radius - soft) return 255;
  if (distance >= radius + soft) return 0;
  const t = (distance - (radius - soft)) / (2 * soft);
  return Math.round(255 * (1 - clamp01(t)));
}

/**
 * Build a full size×size alpha mask (Node-testable).
 * Corners are 0; interior of the circle is 255 with a soft rim.
 */
export function buildEmailHeadshotAlphaMask(
  size: number = EMAIL_HEADSHOT_SIZE,
): Uint8Array {
  const safeSize =
    isPositiveFinite(size) && Number.isInteger(size) ? size : EMAIL_HEADSHOT_SIZE;
  const mask = new Uint8Array(safeSize * safeSize);
  for (let y = 0; y < safeSize; y += 1) {
    for (let x = 0; x < safeSize; x += 1) {
      mask[y * safeSize + x] = circularMaskAlpha(x, y, safeSize);
    }
  }
  return mask;
}

export type EmailHeadshotPadColor = {
  r: number;
  g: number;
  b: number;
  a?: number;
};

/**
 * Software compose a 240×240 RGBA buffer from a source sampler + crop plan.
 * Used by selftests (and any non-Canvas host) to validate framing / alpha.
 */
export function composeEmailHeadshotRgba(input: {
  plan: EmailHeadshotCropPlan;
  /** Sample source pixel in original image coords (not padded). */
  readSource: (x: number, y: number) => EmailHeadshotPadColor;
  /** Color for artificial top pad / out-of-bounds. */
  padColor?: EmailHeadshotPadColor;
}): Uint8ClampedArray {
  const { plan } = input;
  const size = plan.outputSize;
  const pad = input.padColor ?? { r: 245, g: 245, b: 245, a: 255 };
  const out = new Uint8ClampedArray(size * size * 4);
  const mask = buildEmailHeadshotAlphaMask(size);

  for (let oy = 0; oy < size; oy += 1) {
    for (let ox = 0; ox < size; ox += 1) {
      const alphaMask = mask[oy * size + ox]!;
      const i = (oy * size + ox) * 4;
      if (alphaMask === 0) {
        out[i] = 0;
        out[i + 1] = 0;
        out[i + 2] = 0;
        out[i + 3] = 0;
        continue;
      }

      // Map output pixel center → padded crop space → source.
      const paddedX = plan.cropX + (ox + 0.5) / plan.scale;
      const paddedY = plan.cropY + (oy + 0.5) / plan.scale;
      const srcX = paddedX;
      const srcY = paddedY - plan.padTop;

      let sample: EmailHeadshotPadColor;
      if (
        srcY < 0 ||
        srcX < 0 ||
        srcX >= plan.sourceWidth ||
        srcY >= plan.sourceHeight
      ) {
        sample = pad;
      } else {
        sample = input.readSource(Math.floor(srcX), Math.floor(srcY));
      }

      const srcA = sample.a ?? 255;
      out[i] = sample.r;
      out[i + 1] = sample.g;
      out[i + 2] = sample.b;
      out[i + 3] = Math.round((srcA * alphaMask) / 255);
    }
  }

  return out;
}

function readImageSize(
  image: CanvasImageSource,
  override?: { sourceWidth?: number; sourceHeight?: number },
): { width: number; height: number } | null {
  if (
    override?.sourceWidth != null &&
    override?.sourceHeight != null &&
    isPositiveFinite(override.sourceWidth) &&
    isPositiveFinite(override.sourceHeight)
  ) {
    return {
      width: Math.round(override.sourceWidth),
      height: Math.round(override.sourceHeight),
    };
  }

  if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) {
    return { width: image.width, height: image.height };
  }
  if (typeof OffscreenCanvas !== "undefined" && image instanceof OffscreenCanvas) {
    return { width: image.width, height: image.height };
  }
  if (typeof HTMLImageElement !== "undefined" && image instanceof HTMLImageElement) {
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (width > 0 && height > 0) return { width, height };
    return null;
  }
  if (typeof HTMLCanvasElement !== "undefined" && image instanceof HTMLCanvasElement) {
    return { width: image.width, height: image.height };
  }
  if (typeof HTMLVideoElement !== "undefined" && image instanceof HTMLVideoElement) {
    const width = image.videoWidth;
    const height = image.videoHeight;
    if (width > 0 && height > 0) return { width, height };
    return null;
  }
  // Duck-typed (tests / polyfills).
  const duck = image as {
    width?: number;
    height?: number;
    naturalWidth?: number;
    naturalHeight?: number;
  };
  const width = duck.naturalWidth || duck.width;
  const height = duck.naturalHeight || duck.height;
  if (isPositiveFinite(width) && isPositiveFinite(height)) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  return null;
}

type CanvasLike = {
  width: number;
  height: number;
  getContext: (
    type: "2d",
    attrs?: { alpha?: boolean },
  ) => CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
};

function createWorkingCanvas(width: number, height: number): CanvasLike | null {
  if (
    !isPositiveFinite(width) ||
    !isPositiveFinite(height) ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width > EMAIL_HEADSHOT_MAX_EDGE ||
    height > EMAIL_HEADSHOT_MAX_EDGE ||
    width * height > EMAIL_HEADSHOT_MAX_PIXELS
  ) {
    return null;
  }

  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }
  if (typeof document !== "undefined" && document.createElement) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  return null;
}

function canvasToPngBlob(canvas: CanvasLike): Promise<Blob | null> {
  if (
    typeof OffscreenCanvas !== "undefined" &&
    canvas instanceof OffscreenCanvas
  ) {
    return canvas.convertToBlob({ type: EMAIL_HEADSHOT_MIME });
  }
  if (
    typeof HTMLCanvasElement !== "undefined" &&
    canvas instanceof HTMLCanvasElement
  ) {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), EMAIL_HEADSHOT_MIME);
    });
  }
  return Promise.resolve(null);
}

/**
 * Sample pad color from a tiny scaled top-strip canvas — never full-resolution.
 */
function sampleTopPadColorFromImage(
  image: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
): EmailHeadshotPadColor {
  const fallback: EmailHeadshotPadColor = { r: 245, g: 245, b: 245, a: 255 };
  try {
    const sampleW = EMAIL_HEADSHOT_PAD_SAMPLE_WIDTH;
    const sampleH = EMAIL_HEADSHOT_PAD_SAMPLE_HEIGHT;
    const probe = createWorkingCanvas(sampleW, sampleH);
    if (!probe) return fallback;
    const ctx = probe.getContext("2d", { alpha: true });
    if (!ctx) return fallback;

    // Map source top ~2% (min 2px) into the small sample canvas.
    const srcStripH = Math.max(2, Math.min(sourceHeight, Math.round(sourceHeight * 0.02)));
    ctx.clearRect(0, 0, sampleW, sampleH);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(
      image,
      0,
      0,
      sourceWidth,
      srcStripH,
      0,
      0,
      sampleW,
      sampleH,
    );

    const sampleCount = Math.min(24, sampleW);
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    const y = Math.min(2, sampleH - 1);
    for (let i = 0; i < sampleCount; i += 1) {
      const x = Math.floor(((i + 0.5) / sampleCount) * sampleW);
      const data = ctx.getImageData(x, y, 1, 1).data;
      r += data[0]!;
      g += data[1]!;
      b += data[2]!;
      n += 1;
    }
    if (n === 0) return fallback;
    return {
      r: Math.round(r / n),
      g: Math.round(g / n),
      b: Math.round(b / n),
      a: 255,
    };
  } catch {
    return fallback;
  }
}

/**
 * Browser-oriented renderer: draw → circular clip (supersampled) → PNG Blob.
 * On any failure returns `{ ok: false }` — callers keep using the original portrait.
 *
 * Canvas allocations are bounded: pad probe is 64×8; work/output are 960×960 / 240×240.
 * Source pixels are drawn directly from the image into the small work canvas.
 */
export async function createEmailHeadshotPng(
  image: CanvasImageSource,
  options: EmailHeadshotRenderOptions = {},
): Promise<EmailHeadshotResult> {
  try {
    const size = readImageSize(image, options);
    if (!size) {
      return failure(
        "INVALID_DIMENSIONS",
        "Could not read source image dimensions.",
      );
    }

    const plan = planEmailHeadshotCrop({
      sourceWidth: size.width,
      sourceHeight: size.height,
      focusX: options.focusX,
      focusY: options.focusY,
      headroom: options.headroom,
      topPadFraction: options.topPadFraction,
    });
    if (!plan.ok) return plan;

    // Work + output canvases are fixed small sizes (never source-sized).
    if (
      WORK_CANVAS_EDGE > EMAIL_HEADSHOT_MAX_EDGE ||
      WORK_CANVAS_EDGE * WORK_CANVAS_EDGE > EMAIL_HEADSHOT_MAX_PIXELS
    ) {
      return failure("IMAGE_TOO_LARGE", "Internal work canvas exceeds limits.");
    }

    const work = createWorkingCanvas(WORK_CANVAS_EDGE, WORK_CANVAS_EDGE);
    if (!work) {
      return failure(
        "CANVAS_UNAVAILABLE",
        "Canvas is not available in this environment.",
      );
    }

    const ctx = work.getContext("2d", { alpha: true });
    if (!ctx) {
      return failure("CANVAS_UNAVAILABLE", "2D canvas context unavailable.");
    }

    const padColor = sampleTopPadColorFromImage(
      image,
      plan.sourceWidth,
      plan.sourceHeight,
    );

    ctx.clearRect(0, 0, WORK_CANVAS_EDGE, WORK_CANVAS_EDGE);
    ctx.fillStyle = `rgba(${padColor.r},${padColor.g},${padColor.b},1)`;
    ctx.fillRect(0, 0, WORK_CANVAS_EDGE, WORK_CANVAS_EDGE);

    const scaleBig = WORK_CANVAS_EDGE / plan.side;
    if (!isPositiveFinite(scaleBig)) {
      return failure("INVALID_DIMENSIONS", "Render scale is invalid.");
    }

    // Source rect in original image: y may start in the pad (negative srcY).
    const srcX = plan.cropX;
    const srcY = plan.cropY - plan.padTop;

    // Draw only the overlapping source region; pad fill already painted.
    const visibleTop = Math.max(0, srcY);
    const visibleBottom = Math.min(plan.sourceHeight, srcY + plan.side);
    const visibleLeft = Math.max(0, srcX);
    const visibleRight = Math.min(plan.sourceWidth, srcX + plan.side);

    if (visibleBottom > visibleTop && visibleRight > visibleLeft) {
      const sx = visibleLeft;
      const sy = visibleTop;
      const sw = visibleRight - visibleLeft;
      const sh = visibleBottom - visibleTop;
      const dx = (sx - srcX) * scaleBig;
      const dy = (sy - srcY) * scaleBig;
      const dw = sw * scaleBig;
      const dh = sh * scaleBig;
      if (
        !isFiniteNumber(sx) ||
        !isFiniteNumber(sy) ||
        !isFiniteNumber(sw) ||
        !isFiniteNumber(sh) ||
        !isFiniteNumber(dx) ||
        !isFiniteNumber(dy) ||
        !isFiniteNumber(dw) ||
        !isFiniteNumber(dh)
      ) {
        return failure(
          "INVALID_DIMENSIONS",
          "Render draw rectangle is non-finite.",
        );
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
    }

    // Apply circular mask via destination-in ellipse.
    ctx.globalCompositeOperation = "destination-in";
    ctx.beginPath();
    ctx.arc(
      WORK_CANVAS_EDGE / 2,
      WORK_CANVAS_EDGE / 2,
      WORK_CANVAS_EDGE / 2 - AA_FACTOR * 0.5,
      0,
      Math.PI * 2,
    );
    ctx.closePath();
    ctx.fillStyle = "#000";
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    const out = createWorkingCanvas(EMAIL_HEADSHOT_SIZE, EMAIL_HEADSHOT_SIZE);
    if (!out) {
      return failure("CANVAS_UNAVAILABLE", "Output canvas unavailable.");
    }
    const outCtx = out.getContext("2d", { alpha: true });
    if (!outCtx) {
      return failure("CANVAS_UNAVAILABLE", "Output 2D context unavailable.");
    }
    outCtx.clearRect(0, 0, EMAIL_HEADSHOT_SIZE, EMAIL_HEADSHOT_SIZE);
    outCtx.imageSmoothingEnabled = true;
    outCtx.imageSmoothingQuality = "high";
    outCtx.drawImage(
      work as unknown as CanvasImageSource,
      0,
      0,
      WORK_CANVAS_EDGE,
      WORK_CANVAS_EDGE,
      0,
      0,
      EMAIL_HEADSHOT_SIZE,
      EMAIL_HEADSHOT_SIZE,
    );

    const blob = await canvasToPngBlob(out);
    if (!blob || blob.size < 1) {
      return failure("EXPORT_FAILED", "PNG export produced an empty blob.");
    }

    return {
      ok: true,
      blob,
      width: EMAIL_HEADSHOT_SIZE,
      height: EMAIL_HEADSHOT_SIZE,
      mime: EMAIL_HEADSHOT_MIME,
      filename: EMAIL_HEADSHOT_FILENAME,
      plan,
    };
  } catch {
    return failure(
      "RENDER_FAILED",
      "Email headshot rendering failed; keep the original portrait.",
    );
  }
}

/**
 * Convenience: File for FormData uploads (future phase). Null on failure.
 */
export async function createEmailHeadshotFile(
  image: CanvasImageSource,
  options: EmailHeadshotRenderOptions = {},
): Promise<File | null> {
  const result = await createEmailHeadshotPng(image, options);
  if (!result.ok) return null;
  return new File([result.blob], result.filename, { type: result.mime });
}
