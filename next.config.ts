import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

/**
 * OpenNext Cloudflare wrangler/miniflare wiring for `next dev` only.
 * Skip Vercel and any production `next build` (including the inner Next
 * compile used by `opennextjs-cloudflare build` / `pnpm deploy:cf`).
 * Vercel sets VERCEL=1; `next build` sets NODE_ENV=production.
 */
function shouldInitOpenNextCloudflareForDev() {
  if (process.env.VERCEL) return false;
  if (process.env.NODE_ENV === "production") return false;
  return true;
}

function resolveHouzzatBuildId(): string {
  const fromEnv = process.env.NEXT_PUBLIC_HOUZZAT_BUILD?.trim();
  if (fromEnv) return fromEnv;
  const sha = process.env.GITHUB_SHA?.trim();
  if (sha) {
    const run = process.env.GITHUB_RUN_ID?.trim();
    return run ? `${sha.slice(0, 12)}-${run}` : sha.slice(0, 12);
  }
  if (process.env.NODE_ENV === "production") {
    return `b${Date.now().toString(36)}`;
  }
  return "dev";
}

const houzzatBuildId = resolveHouzzatBuildId();

const nextConfig: NextConfig = {
  generateBuildId: async () => houzzatBuildId,
  env: {
    NEXT_PUBLIC_HOUZZAT_BUILD: houzzatBuildId,
  },
  serverExternalPackages: [
    "@prisma/client",
    ".prisma/client",
    "@prisma/adapter-neon",
    "@neondatabase/serverless",
  ],
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      // AMPRE / PropTx listing photos (CDN hosts vary by board feed)
      { protocol: "https", hostname: "**.cloudfront.net" },
      { protocol: "https", hostname: "**.amazonaws.com" },
      { protocol: "https", hostname: "**.ampre.ca" },
      { protocol: "https", hostname: "trreb-image.ampre.ca" },
      { protocol: "https", hostname: "**.ampre.us" },
      { protocol: "https", hostname: "**.realtor.ca" },
      { protocol: "https", hostname: "**.trlreb.ca" },
      { protocol: "https", hostname: "**.trreb.ca" },
      { protocol: "https", hostname: "**.photos.listhub.net" },
      { protocol: "https", hostname: "**.listhub.net" },
      { protocol: "https", hostname: "cdn.photos.axl.realtor" },
      { protocol: "https", hostname: "**.axl.realtor" },
    ],
  },
  async redirects() {
    return [
      {
        source: "/viewing-day",
        destination: "/route-planner",
        permanent: true,
      },
      {
        source: "/viewing-day/:path*",
        destination: "/route-planner/:path*",
        permanent: true,
      },
      {
        source: "/account/viewing-day",
        destination: "/route-planner",
        permanent: true,
      },
      {
        source: "/api/viewing-day",
        destination: "/api/route-planner",
        permanent: false,
      },
      {
        source: "/api/viewing-day/:path*",
        destination: "/api/route-planner/:path*",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;

if (shouldInitOpenNextCloudflareForDev()) {
  initOpenNextCloudflareForDev({ remoteBindings: true });
}
