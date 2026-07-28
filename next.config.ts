import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
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

initOpenNextCloudflareForDev({ remoteBindings: true });
