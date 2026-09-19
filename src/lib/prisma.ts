import { cache } from "react";
import { after } from "next/server";
import { PrismaNeon, PrismaNeonHttp } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import {
  tryGetCloudflareEnvSync,
  tryGetCloudflareWaitUntil,
} from "@/lib/runtime/cloudflare-context";

type HyperdriveBinding = {
  connectionString: string;
};

type CloudflareBindings = {
  DATABASE_URL?: string;
  HYPERDRIVE?: HyperdriveBinding;
};

type NeonAdapterKind = "http" | "ws";

/** Bump when Prisma schema fields change so local HMR drops a stale singleton. */
const PRISMA_CLIENT_GENERATION = "sms-phase4-isv";

const globalForPrisma = globalThis as typeof globalThis & {
  __houzzatPrisma?: PrismaClient;
  __houzzatPrismaGeneration?: string;
};

function isWorkerdRuntime() {
  return (
    typeof navigator !== "undefined" &&
    navigator.userAgent === "Cloudflare-Workers"
  );
}

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
  // Vercel: never call OpenNext context (async mode boots wrangler).
  const bindings = tryGetCloudflareEnvSync() as CloudflareBindings | null;
  if (bindings) {
    const fromBinding = readDatabaseUrlFromEnv(bindings);
    if (fromBinding) return fromBinding;
    if (bindings.HYPERDRIVE?.connectionString) {
      return bindings.HYPERDRIVE.connectionString;
    }
  }

  return readDatabaseUrlFromEnv(process.env);
}

function createPrismaClient(
  connectionString: string,
  neonKind: NeonAdapterKind = "ws",
) {
  if (shouldUseNeonAdapter(connectionString)) {
    switch (neonKind) {
      case "http":
        // Stateless HTTP fetch per query — safe to overlap on Workers.
        // PrismaNeonHttp's second arg is required by the 7.8 types.
        return new PrismaClient({
          adapter: new PrismaNeonHttp(connectionString, {}),
        });
      case "ws":
        return new PrismaClient({
          adapter: new PrismaNeon({ connectionString, max: 1 }),
        });
      default: {
        const _exhaustive: never = neonKind;
        throw new Error(`Unknown Neon adapter kind: ${_exhaustive}`);
      }
    }
  }

  // Workers must not reuse pooled connections across requests.
  const adapter = new PrismaPg({
    connectionString,
    max: 1,
    maxUses: 1,
  });
  return new PrismaClient({ adapter });
}

/**
 * PrismaNeonHttp cannot BEGIN/COMMIT. Interactive transactions and
 * Prisma.upsert (which calls adapter.startTransaction) fail on Workers.
 * Run $transaction on a one-shot WebSocket pool that lives only for this
 * call, then disconnect. Prefer find+create/update on the request path.
 */
function runWorkerdNeonTransaction(
  connectionString: string,
): PrismaClient["$transaction"] {
  return ((...args: unknown[]) => {
    const wsClient = createPrismaClient(connectionString, "ws");
    const run = (
      wsClient.$transaction as (...transactionArgs: unknown[]) => Promise<unknown>
    )(...args);
    return Promise.resolve(run).finally(() =>
      wsClient.$disconnect().catch(() => undefined),
    );
  }) as PrismaClient["$transaction"];
}

/** Per-request client (preferred on Cloudflare Workers). */
export const getPrisma = cache(() => {
  const connectionString = readDatabaseUrl();
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  if (isWorkerdRuntime() && shouldUseNeonAdapter(connectionString)) {
    return createPrismaClient(connectionString, "http");
  }
  return createPrismaClient(connectionString, "ws");
});

function getPrismaCompat() {
  // Local Next.js HMR benefits from a reusable client; Workers should not.
  if (isWorkerdRuntime()) {
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
    globalForPrisma.__houzzatPrisma = createPrismaClient(
      connectionString,
      "ws",
    );
    globalForPrisma.__houzzatPrismaGeneration = PRISMA_CLIENT_GENERATION;
  }
  return globalForPrisma.__houzzatPrisma;
}

/**
 * Keep non-critical I/O alive after the HTTP response is sent.
 * Cloudflare Workers: ctx.waitUntil.
 * Vercel / Next.js 16: after().
 * Scripts / no request scope: fire-and-forget.
 */
export function scheduleWorkerSideEffect(work: Promise<unknown>): void {
  const tracked = work.catch(() => undefined);
  if (isWorkerdRuntime()) {
    const waitUntil = tryGetCloudflareWaitUntil();
    if (waitUntil) {
      waitUntil(tracked);
      return;
    }
    void tracked;
    return;
  }
  try {
    after(tracked);
  } catch {
    void tracked;
  }
}

// Lazy proxy so build-time imports don't require DATABASE_URL
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    if (prop === "$transaction" && isWorkerdRuntime()) {
      const connectionString = readDatabaseUrl();
      if (connectionString && shouldUseNeonAdapter(connectionString)) {
        return runWorkerdNeonTransaction(connectionString);
      }
    }
    const client = getPrismaCompat();
    const value = client[prop as keyof PrismaClient];
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});
