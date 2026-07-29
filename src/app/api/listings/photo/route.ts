import { NextResponse } from "next/server";
import { getPropTxIdxConfig, getPropTxConfig } from "@/lib/proptx/config";

export const runtime = "nodejs";

/**
 * Proxy listing photos so Next/Image can load AMPRE CDN URLs
 * (unknown hosts + occasional auth-gated MediaURL).
 */
export async function GET(request: Request) {
  const src = new URL(request.url).searchParams.get("src")?.trim();
  if (!src || !/^https:\/\//i.test(src)) {
    return NextResponse.json({ error: "Invalid src" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(src);
  } catch {
    return NextResponse.json({ error: "Invalid src" }, { status: 400 });
  }
  if (parsed.protocol !== "https:") {
    return NextResponse.json({ error: "HTTPS only" }, { status: 400 });
  }

  const headers: HeadersInit = {
    Accept: "image/*,*/*",
    "User-Agent": "HouzzatListingPhotoProxy/1.0",
  };

  let res = await fetch(src, { headers, redirect: "follow" });

  // Some AMPRE MediaURL targets expect the feed bearer token.
  if (res.status === 401 || res.status === 403) {
    const config = getPropTxIdxConfig() ?? getPropTxConfig();
    if (config) {
      res = await fetch(src, {
        headers: {
          ...headers,
          Authorization: `Bearer ${config.bearerToken}`,
          [config.tokenIdHeader]: config.tokenId,
        },
        redirect: "follow",
      });
    }
  }

  if (!res.ok) {
    return NextResponse.json(
      { error: `Upstream ${res.status}` },
      { status: 502 },
    );
  }

  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  if (!contentType.startsWith("image/") && !contentType.includes("octet-stream")) {
    return NextResponse.json({ error: "Not an image" }, { status: 502 });
  }

  const body = await res.arrayBuffer();
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType.startsWith("image/")
        ? contentType
        : "image/jpeg",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
