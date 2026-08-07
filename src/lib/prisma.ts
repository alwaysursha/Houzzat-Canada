import { cache } from "react";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

type HyperdriveBinding = {
  connectionString: string;
};

type CloudflareBindings = {
  DATABASE_URL?: string;
  HYPERDRIVE?: HyperdriveBinding;
};

/** Bump when Prisma schema fields change so local HMR drops a stale singleton. */
const PRISMA_CLIENT_GENERATION = "sold-conditional-v1";

const globalForPrisma = globalThis as typeof globalThis & {
  __houzzatPrisma?: PrismaClient;
  __houzzatPrismaGeneration?: string;
};

function shouldUseNeonAdapter(connectionString: string) {
  return (
    process.env.USE_NEON_ADAPTER === "1" ||
    connectionString.includes("neon.tech") ||
    connectionString.includes("neon.database")
  );
}

function readDatabaseUrlFromEnv(env: CloudflareBindings | NodeJS.ProcessEnv) {
  const databaseUrl = env.DATABASE_URL;
  if (typeof databaseUrl === "string" && databaseUrl.trim()) {
    return databaseUrl.trim();
  }
  return undefined;
}

function readDatabaseUrl(): string | undefined {
  // Prefer live Worker bindings — OpenNext only copies env into process.env
  // once on the first request, which can miss secrets.
  try {
    const { env } = getCloudflareContext();
    const bindings = env as typeof env & CloudflareBindings;
    const fromBinding = readDatabaseUrlFromEnv(bindings);
    if (fromBinding) return fromBinding;
    if (bindings.HYPERDRIVE?.connectionString) {
      return bindings.HYPERDRIVE.connectionString;
    }
  } catch {
    // Outside Cloudflare request context (local build, tests, etc.)
  }

  return readDatabaseUrlFromEnv(process.env);
}

function createPrismaClient(connectionString: string) {
  if (shouldUseNeonAdapter(connectionString)) {
    const adapter = new PrismaNeon({ connectionString });
    return new PrismaClient({ adapter });
  }

  // Workers must not reuse pooled connections across requests.
  const adapter = new PrismaPg({
    connectionString,
    max: 1,
    maxUses: 1,
  });
  return new PrismaClient({ adapter });
}

/** Per-request client (preferred on Cloudflare Workers). */
export const getPrisma = cache(() => {
  const connectionString = readDatabaseUrl();
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  return createPrismaClient(connectionString);
});

function getPrismaCompat() {
  // Local Next.js HMR benefits from a reusable client; Workers should not.
  const isWorkerd =
    typeof navigator !== "undefined" &&
    navigator.userAgent === "Cloudflare-Workers";

  if (isWorkerd) {
    return getPrisma();
  }

  if (
    !globalForPrisma.__houzzatPrisma ||
    globalForPrisma.__houzzatPrismaGeneration !== PRISMA_CLIENT_GENERATION
  ) {
    const connectionString = readDatabaseUrl();
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    void globalForPrisma.__houzzatPrisma?.$disconnect().catch(() => undefined);
    globalForPrisma.__houzzatPrisma = createPrismaClient(connectionString);
    globalForPrisma.__houzzatPrismaGeneration = PRISMA_CLIENT_GENERATION;
  }
  return globalForPrisma.__houzzatPrisma;
}

// Lazy proxy so build-time imports don't require DATABASE_URL
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaCompat();
    const value = client[prop as keyof PrismaClient];
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});
