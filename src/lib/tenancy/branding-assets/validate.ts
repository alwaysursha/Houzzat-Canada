/**
 * Stage 6.11C.1 — magic-byte MIME + dimension validation (no filename trust).
 * SVG excluded — no safe sanitizer in-repo for this stage.
 */

export type ValidatedBrandingImage = {
  mime: "image/jpeg" | "image/png" | "image/webp";
  ext: "jpg" | "png" | "webp";
  width: number;
  height: number;
  bytes: Uint8Array;
};

export type BrandingImageValidationError = {
  code:
    | "EMPTY_FILE"
    | "FILE_TOO_LARGE"
    | "UNSUPPORTED_MIME"
    | "CORRUPT_IMAGE"
    | "DIMENSIONS_TOO_SMALL";
  message: string;
};

const MAX_BYTES = 5 * 1024 * 1024;

/** Agent profile must support 3:4 / 4:5 object-cover presentation. */
const AGENT_PROFILE_MIN_WIDTH = 400;
const AGENT_PROFILE_MIN_HEIGHT = 500;

/** Logos / favicon — any decodeable raster is accepted (templates scale marks). */
const MARK_MIN_WIDTH = 1;
const MARK_MIN_HEIGHT = 1;

function readU32BE(buf: Uint8Array, offset: number): number {
  return (
    ((buf[offset]! << 24) |
      (buf[offset + 1]! << 16) |
      (buf[offset + 2]! << 8) |
      buf[offset + 3]!) >>>
    0
  );
}

function readU16BE(buf: Uint8Array, offset: number): number {
  return (buf[offset]! << 8) | buf[offset + 1]!;
}

function detectMime(
  bytes: Uint8Array,
): ValidatedBrandingImage["mime"] | null {
  if (bytes.length < 12) return null;
  // JPEG
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  // PNG
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  // WebP (RIFF....WEBP)
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

function pngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  // IHDR starts at byte 16 after 8-byte signature + 8-byte chunk header
  const width = readU32BE(bytes, 16);
  const height = readU32BE(bytes, 20);
  if (width < 1 || height < 1) return null;
  return { width, height };
}

function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1]!;
    offset += 2;
    // Soft markers without length
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01) continue;
    if (marker >= 0xd0 && marker <= 0xd7) continue;
    if (offset + 2 > bytes.length) return null;
    const length = readU16BE(bytes, offset);
    if (length < 2 || offset + length > bytes.length) return null;
    // SOF0–SOF3, SOF5–SOF7, SOF9–SOF11, SOF13–SOF15
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSof) {
      if (offset + 7 > bytes.length) return null;
      const height = readU16BE(bytes, offset + 3);
      const width = readU16BE(bytes, offset + 5);
      if (width < 1 || height < 1) return null;
      return { width, height };
    }
    offset += length;
  }
  return null;
}

function webpDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 30) return null;
  const chunk = String.fromCharCode(
    bytes[12]!,
    bytes[13]!,
    bytes[14]!,
    bytes[15]!,
  );
  if (chunk === "VP8X" && bytes.length >= 30) {
    const width =
      1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16));
    const height =
      1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16));
    return { width, height };
  }
  if (chunk === "VP8 " && bytes.length >= 30) {
    // Lossy bitstream: dimensions at offset 26 (little-endian 16-bit, 14 useful bits)
    const width = readU16LE(bytes, 26) & 0x3fff;
    const height = readU16LE(bytes, 28) & 0x3fff;
    if (width < 1 || height < 1) return null;
    return { width, height };
  }
  if (chunk === "VP8L" && bytes.length >= 25) {
    const b0 = bytes[21]!;
    const b1 = bytes[22]!;
    const b2 = bytes[23]!;
    const b3 = bytes[24]!;
    const width = 1 + ((b0 | ((b1 & 0x3f) << 8)) & 0x3fff);
    const height =
      1 + ((((b1 >> 6) | (b2 << 2) | ((b3 & 0x0f) << 10)) & 0x3fff));
    return { width, height };
  }
  return null;
}

function readU16LE(buf: Uint8Array, offset: number): number {
  return buf[offset]! | (buf[offset + 1]! << 8);
}

function mimeToExt(
  mime: ValidatedBrandingImage["mime"],
): ValidatedBrandingImage["ext"] {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default: {
      const _exhaustive: never = mime;
      return _exhaustive;
    }
  }
}

export function validateBrandingImageBytes(
  raw: ArrayBuffer | Uint8Array,
  kind: "agent-profile" | "logo" | "brokerage-logo" | "favicon",
): ValidatedBrandingImage | BrandingImageValidationError {
  const bytes =
    raw instanceof Uint8Array ? raw : new Uint8Array(raw);

  if (bytes.length === 0) {
    return { code: "EMPTY_FILE", message: "File is empty." };
  }
  if (bytes.length > MAX_BYTES) {
    return {
      code: "FILE_TOO_LARGE",
      message: "File too large (max 5MB).",
    };
  }

  const mime = detectMime(bytes);
  if (!mime) {
    return {
      code: "UNSUPPORTED_MIME",
      message:
        "Unsupported image type. Use JPEG, PNG, or WebP (SVG not allowed).",
    };
  }

  let dims: { width: number; height: number } | null = null;
  if (mime === "image/png") dims = pngDimensions(bytes);
  else if (mime === "image/jpeg") dims = jpegDimensions(bytes);
  else dims = webpDimensions(bytes);

  if (!dims) {
    return {
      code: "CORRUPT_IMAGE",
      message: "Could not read image dimensions.",
    };
  }

  const minW =
    kind === "agent-profile" ? AGENT_PROFILE_MIN_WIDTH : MARK_MIN_WIDTH;
  const minH =
    kind === "agent-profile" ? AGENT_PROFILE_MIN_HEIGHT : MARK_MIN_HEIGHT;

  if (dims.width < minW || dims.height < minH) {
    return {
      code: "DIMENSIONS_TOO_SMALL",
      message:
        kind === "agent-profile"
          ? `Agent profile photo must be at least ${minW}×${minH}px.`
          : `Image must be at least ${minW}×${minH}px.`,
    };
  }

  return {
    mime,
    ext: mimeToExt(mime),
    width: dims.width,
    height: dims.height,
    bytes,
  };
}

export const BRANDING_ASSET_MAX_BYTES = MAX_BYTES;
