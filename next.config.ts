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
