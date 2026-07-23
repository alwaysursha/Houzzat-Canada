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

const globalForPrisma = globalThis as typeof globalThis & {
  __houzzatPrisma?: PrismaClient;
};

function readDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  try {
    const { env } = getCloudflareContext();
    const bindings = env as typeof env & CloudflareBindings;
    if (typeof bindings.DATABASE_URL === "string" && bindings.DATABASE_URL) {
      return bindings.DATABASE_URL;
    }
    if (bindings.HYPERDRIVE?.connectionString) {
      return bindings.HYPERDRIVE.connectionString;
    }
  } catch {
    // Outside Cloudflare runtime (local build, tests, etc.)
  }

  return undefined;
}

function shouldUseNeonAdapter(connectionString: string) {
  return (
    process.env.USE_NEON_ADAPTER === "1" ||
    connectionString.includes("neon.tech") ||
    connectionString.includes("neon.database")
  );
}

function createPrismaClient() {
  const connectionString = readDatabaseUrl();

  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  if (shouldUseNeonAdapter(connectionString)) {
    const adapter = new PrismaNeon({ connectionString });
    return new PrismaClient({ adapter });
  }

  // Cap pool size so Next.js HMR / parallel routes don't exhaust Postgres.
  const adapter = new PrismaPg({ connectionString, max: 5 });
  return new PrismaClient({ adapter });
}

export function getPrisma() {
  if (!globalForPrisma.__houzzatPrisma) {
    globalForPrisma.__houzzatPrisma = createPrismaClient();
  }
  return globalForPrisma.__houzzatPrisma;
}

// Lazy proxy so build-time imports don't require DATABASE_URL
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrisma();
    const value = client[prop as keyof PrismaClient];
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});
