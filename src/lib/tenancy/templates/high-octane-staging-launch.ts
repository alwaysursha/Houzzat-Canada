/**
 * Fail-closed plan for a second local HIGH OCTANE Next.js process.
 * Building this plan does not open a database connection or start Next.js.
 */
import { evaluateHighOctaneStagingEnvironment } from "@/lib/tenancy/templates/high-octane-staging";
import {
  DEFAULT_NEXT_DIST_DIR,
  HIGH_OCTANE_STAGING_NEXT_DIST_DIR,
  resolveNextDistDir,
} from "@/lib/next/high-octane-staging-dist-dir";

export const HIGH_OCTANE_STAGING_DIRECT_HOST =
  "ep-red-credit-axp65p8a.c-4.us-east-2.aws.neon.tech";
export const HIGH_OCTANE_STAGING_POOLED_HOST =
  "ep-red-credit-axp65p8a-pooler.c-4.us-east-2.aws.neon.tech";
export const HIGH_OCTANE_STAGING_BRANCH_ID = "br-dark-surf-axbepvr1";
export const HIGH_OCTANE_STAGING_ORIGIN = "http://localhost:3010";
export const HIGH_OCTANE_STAGING_HOSTNAME = "localhost";
export const HIGH_OCTANE_STAGING_PORT = "3010";
export const HOUZZAT_DEV_HOSTNAME = "127.0.0.1";
export const HIGH_OCTANE_STAGING_AUTH_SECRET_ENV = "HIGH_OCTANE_STAGING_AUTH_SECRET";

const PRODUCTION_HOSTS = new Set([
  "ep-snowy-river-axfgwomo.c-4.us-east-2.aws.neon.tech",
  "ep-snowy-river-axfgwomo-pooler.c-4.us-east-2.aws.neon.tech",
]);

/** Values that are safe to place in the staging process. Nothing here is a credential. */
const SAFE_FORCED_VALUES = new Set(["", "0", "1", "mock", "idx"]);

/**
 * Explicit values for every integration Next.js would otherwise load from .env.local.
 * Empty strings stay set so the file cannot fill them back in.
 */
export const FORCED_STAGING_INTEGRATIONS = {
  GOOGLE_MAPS_API_KEY: "",
  GOOGLE_MAPS_GEOCODING_API_KEY: "",
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: "",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  GOOGLE_PLACES_AUTOCOMPLETE: "0",
  GOOGLE_MAPS_BILLING_ENABLED: "0",
  GOOGLE_ROUTES_ENABLED: "0",
  GEOCODE_SKIP_GOOGLE: "1",
  GEOCODE_USE_GOOGLE: "0",
  NEXT_PUBLIC_WHATSAPP_EXPERT: "",
  NEXT_PUBLIC_WHATSAPP_NUMBER: "",
  COMING_SOON: "0",
  LISTING_PROVIDER: "mock",
  PROPTX_ENDPOINT_URL: "",
  PROPTX_BEARER_TOKEN: "",
  PROPTX_TOKEN_ID: "",
  PROPTX_IDX_BEARER_TOKEN: "",
  PROPTX_IDX_TOKEN_ID: "",
  PROPTX_VOW_BEARER_TOKEN: "",
  PROPTX_VOW_TOKEN_ID: "",
  PROPTX_TOKEN_ID_HEADER: "",
  PROPTX_FEED: "idx",
  MLS_SYNC_SECRET: "",
  MLS_SYNC_CITIES: "",
  MLS_SYNC_ACTIVE_INVENTORY: "0",
  MLS_ON_MARKET_RECONCILE: "0",
  MLS_HEALTH_ALERT_EMAIL: "",
  TYPESENSE_HOST: "",
  TYPESENSE_PORT: "",
  TYPESENSE_PROTOCOL: "",
  TYPESENSE_ADMIN_API_KEY: "",
  TYPESENSE_SEARCH_API_KEY: "",
  TYPESENSE_COLLECTION: "",
  TYPESENSE_AUTOCOMPLETE: "0",
  TYPESENSE_SEARCH: "0",
  TYPESENSE_SYNC: "0",
  RESEND_API_KEY: "",
  RESEND_WEBHOOK_SECRET: "",
  EMAIL_FROM: "",
  EMAIL_FROM_NOTIFY: "",
  EMAIL_FROM_ALERTS: "",
  EMAIL_ADMIN_TO: "",
  HOUZZATPRO_DEMO_NOTIFICATION_EMAIL: "",
  HOUZZATPRO_EMAIL_FROM: "",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
  TURNSTILE_SECRET_KEY: "",
  VERCEL_OIDC_TOKEN: "",
  TWILIO_ACCOUNT_SID: "",
  TWILIO_AUTH_TOKEN: "",
  TWILIO_SUBACCOUNT_AUTH_TOKENS: "",
  TWILIO_WEBHOOK_SHARED_KEY: "",
  TWILIO_WHATSAPP_FROM: "",
  TWILIO_STATUS_CALLBACK_URL: "",
  TWILIO_INBOUND_WEBHOOK_URL: "",
  TWILIO_MANAGES_KEYWORD_REPLIES: "",
  STRIPE_SECRET_KEY: "",
  STRIPE_WEBHOOK_SECRET: "",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "",
  R2_ACCESS_KEY_ID: "",
  R2_SECRET_ACCESS_KEY: "",
  R2_S3_ENDPOINT: "",
  R2_BUCKET_NAME: "",
  CHAT_MEDIA_R2_ACCESS_KEY_ID: "",
  CHAT_MEDIA_R2_SECRET_ACCESS_KEY: "",
  CHAT_MEDIA_R2_S3_ENDPOINT: "",
  CHAT_MEDIA_R2_BUCKET_NAME: "",
  CHAT_MEDIA_FORCE_LOCAL: "1",
  BRANDING_ASSETS_PUBLIC_BASE_URL: "",
  CLOUDFLARE_ACCOUNT_ID: "",
  CLOUDFLARE_API_TOKEN: "",
  CLOUDFLARE_BROWSER_RENDERING_API_TOKEN: "",
  OPENAI_API_KEY: "",
  FIREBASE_SERVICE_ACCOUNT: "",
  MAPBOX_TOKEN: "",
  NEXT_PUBLIC_MAPBOX_TOKEN: "",
  NEXT_PUBLIC_CARTO_API_KEY: "",
  NEXT_PUBLIC_META_PIXEL_ID: "",
  NEXT_PUBLIC_GOOGLE_ADS_ID: "",
  CRON_SECRET: "",
  DIGEST_CRON_SECRET: "",
  DIGEST_CRON_URL: "",
  ALLOW_TEMPLATE_PREVIEW: "",
  HOUZZAT_TEMPLATE_PREVIEW: "",
  NEXT_PUBLIC_OFF_MARKET_PROPERTY_SEARCH_ENABLED: "0",
  NEXT_PUBLIC_NL_SEARCH_PARSER_V2: "0",
} as const;

const CONTROLLED_FILE_KEYS = new Set([
  "DATABASE_URL",
  "DIRECT_URL",
  "AUTH_SECRET",
  "NEXTAUTH_SECRET",
  "AUTH_URL",
  "NEXTAUTH_URL",
  "NEXT_PUBLIC_SITE_URL",
  "STAGING_DATABASE_URL",
  "STAGING_DIRECT_URL",
  HIGH_OCTANE_STAGING_AUTH_SECRET_ENV,
]);

const CREDENTIAL_NAME =
  /(SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE|CREDENTIAL|WEBHOOK|BEARER|ACCOUNT_SID|SERVICE_ACCOUNT|_KEY$)/i;

export type LaunchMode = "dry-run" | "start";

export type StagingNextCommand = {
  command: "pnpm";
  args: readonly ["exec", "next", "dev", "--hostname", "localhost", "--port", "3010", "--webpack"];
};

export type SanitizedIntegration = {
  name: string;
  state: "cleared" | "off" | "mock" | "idx" | "local-only" | "skip-google";
};

export type SanitizedLaunchReport = {
  mode: LaunchMode;
  ready: boolean;
  directHostVerified: boolean;
  pooledHostVerified: boolean;
  branchVerified: boolean;
  branchId: string | null;
  distDir: typeof DEFAULT_NEXT_DIST_DIR | typeof HIGH_OCTANE_STAGING_NEXT_DIST_DIR;
  hostname: typeof HIGH_OCTANE_STAGING_HOSTNAME;
  port: typeof HIGH_OCTANE_STAGING_PORT;
  origin: typeof HIGH_OCTANE_STAGING_ORIGIN;
  devHostnameLeftUntouched: typeof HOUZZAT_DEV_HOSTNAME;
  authSecretPresent: boolean;
  authSecretDedicated: boolean;
  integrations: SanitizedIntegration[];
  blockers: string[];
  nextStarted: false;
  prismaGenerate: false;
  mutableOutputIsolated: boolean;
};

export type LaunchDecision = {
  ok: boolean;
  blockers: string[];
  childEnv: Record<string, string>;
  command: StagingNextCommand;
  report: SanitizedLaunchReport;
};

export type LaunchInput = {
  fileEnv: Record<string, string | undefined>;
  /** Null until a read-only probe has returned neon.branch_id. */
  branchId: string | null;
  mode?: LaunchMode;
};

function parsedDatabase(raw: string | undefined): { host: string; database: string } | null {
  if (!raw?.trim()) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") return null;
    const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
    if (!url.hostname || !database) return null;
    return { host: url.hostname.toLowerCase(), database };
  } catch {
    return null;
  }
}

function integrationState(name: string, value: string): SanitizedIntegration["state"] {
  if (name === "CHAT_MEDIA_FORCE_LOCAL") return "local-only";
  if (name === "GEOCODE_SKIP_GOOGLE") return "skip-google";
  if (value === "0") return "off";
  if (value === "mock") return "mock";
  if (value === "idx") return "idx";
  return "cleared";
}

function assertForcedValuesSafe(): void {
  for (const value of Object.values(FORCED_STAGING_INTEGRATIONS)) {
    if (!SAFE_FORCED_VALUES.has(value)) {
      throw new Error("staging integration table contains an unsafe forced value");
    }
  }
}

export function unclassifiedFileKeys(fileEnv: Record<string, string | undefined>): string[] {
  const known = new Set<string>([
    ...Object.keys(FORCED_STAGING_INTEGRATIONS),
    ...CONTROLLED_FILE_KEYS,
  ]);
  return Object.keys(fileEnv)
    .filter((key) => fileEnv[key] !== undefined && !known.has(key))
    .sort();
}

export function unsafeChildIntegrationKeys(env: Record<string, string | undefined>): string[] {
  const unsafe: string[] = [];
  for (const [name, forced] of Object.entries(FORCED_STAGING_INTEGRATIONS)) {
    const value = env[name];
    if (value !== forced) unsafe.push(name);
    if (CREDENTIAL_NAME.test(name) && value?.trim()) unsafe.push(name);
  }
  return unsafe;
}

export function evaluateHighOctaneStagingLaunch(input: LaunchInput): LaunchDecision {
  assertForcedValuesSafe();
  const mode = input.mode ?? "dry-run";
  const blockers: string[] = [];
  const fileEnv = input.fileEnv;
  const direct = parsedDatabase(fileEnv.STAGING_DIRECT_URL);
  const pooled = parsedDatabase(fileEnv.STAGING_DATABASE_URL);
  const productionDatabase = fileEnv.DATABASE_URL?.trim() ?? "";
  const productionDirect = fileEnv.DIRECT_URL?.trim() ?? "";
  const stagingDirect = fileEnv.STAGING_DIRECT_URL?.trim() ?? "";

  if (!direct) blockers.push("staging_direct_missing");
  if (direct?.host.includes("pooler") || stagingDirect.toLowerCase().includes("-pooler")) {
    blockers.push("staging_direct_is_pooler");
  }
  if (direct && PRODUCTION_HOSTS.has(direct.host)) blockers.push("staging_direct_is_production");
  if (direct && direct.host !== HIGH_OCTANE_STAGING_DIRECT_HOST) {
    blockers.push("staging_direct_host_mismatch");
  }
  if (stagingDirect && (stagingDirect === productionDatabase || stagingDirect === productionDirect)) {
    blockers.push("staging_direct_matches_production_url");
  }
  if (!pooled) blockers.push("staging_pooled_missing");
  if (pooled && PRODUCTION_HOSTS.has(pooled.host)) blockers.push("staging_pooled_is_production");
  if (pooled && pooled.host !== HIGH_OCTANE_STAGING_POOLED_HOST) {
    blockers.push("staging_pooled_not_sibling");
  }
  if (direct && pooled && direct.database !== pooled.database) {
    blockers.push("staging_database_name_mismatch");
  }

  const secret = fileEnv[HIGH_OCTANE_STAGING_AUTH_SECRET_ENV]?.trim() ?? "";
  const productionAuth = new Set(
    [fileEnv.AUTH_SECRET?.trim(), fileEnv.NEXTAUTH_SECRET?.trim()].filter(
      (value): value is string => Boolean(value),
    ),
  );
  const authSecretPresent = secret.length >= 16;
  const authSecretDedicated = authSecretPresent && !productionAuth.has(secret);
  if (!authSecretPresent) blockers.push("staging_auth_secret_missing");
  if (secret && productionAuth.has(secret)) blockers.push("staging_auth_secret_reuses_production");

  for (const key of unclassifiedFileKeys(fileEnv)) {
    blockers.push(
      CREDENTIAL_NAME.test(key) ? `unknown_credential:${key}` : `unknown_setting:${key}`,
    );
  }

  const branchVerified = input.branchId === HIGH_OCTANE_STAGING_BRANCH_ID;
  if (input.branchId === null) blockers.push("staging_branch_unverified");
  else if (!branchVerified) blockers.push("staging_branch_mismatch");

  const databaseReady =
    branchVerified &&
    direct?.host === HIGH_OCTANE_STAGING_DIRECT_HOST &&
    pooled?.host === HIGH_OCTANE_STAGING_POOLED_HOST &&
    !blockers.some((blocker) => blocker.startsWith("staging_direct") || blocker.startsWith("staging_pooled") || blocker === "staging_database_name_mismatch" || blocker === "staging_branch_mismatch");

  const childEnv: Record<string, string> = {
    NODE_ENV: "development",
    WATCHPACK_POLLING: "true",
    HIGH_OCTANE_STAGING: "1",
    HIGH_OCTANE_STAGING_ACCESS: "authenticated",
    HIGH_OCTANE_STAGING_DIST: "1",
    TENANT_DOMAIN_SCOPE: "workspace",
    TENANT_BRANDING_SCOPE: "workspace",
    TENANT_PUBLIC_LEAD_SCOPE: "workspace",
    WORKSPACE_READ_SCOPE: "workspace",
    NEXTAUTH_URL: HIGH_OCTANE_STAGING_ORIGIN,
    AUTH_URL: HIGH_OCTANE_STAGING_ORIGIN,
    NEXT_PUBLIC_SITE_URL: HIGH_OCTANE_STAGING_ORIGIN,
    DATABASE_URL: databaseReady ? stagingDirect : "",
    DIRECT_URL: databaseReady ? stagingDirect : "",
    STAGING_DATABASE_URL: databaseReady ? (fileEnv.STAGING_DATABASE_URL?.trim() ?? "") : "",
    STAGING_DIRECT_URL: databaseReady ? stagingDirect : "",
    AUTH_SECRET: authSecretDedicated ? secret : "",
    NEXTAUTH_SECRET: authSecretDedicated ? secret : "",
    ...FORCED_STAGING_INTEGRATIONS,
  };
  const processEnv = childEnv as NodeJS.ProcessEnv;

  if (resolveNextDistDir(processEnv) !== HIGH_OCTANE_STAGING_NEXT_DIST_DIR) {
    blockers.push("staging_dist_dir_not_selected");
  }
  if (childEnv.DATABASE_URL && (childEnv.DATABASE_URL === productionDatabase || childEnv.DATABASE_URL === productionDirect)) {
    blockers.push("child_database_url_is_production");
    childEnv.DATABASE_URL = "";
    childEnv.DIRECT_URL = "";
  }
  for (const key of unclassifiedFileKeys(fileEnv)) {
    childEnv[key] = "";
  }
  const unsafe = unsafeChildIntegrationKeys(childEnv);
  if (unsafe.length > 0) blockers.push(`unsafe_integration:${unsafe.join(",")}`);

  const gate = evaluateHighOctaneStagingEnvironment(processEnv);
  if (databaseReady && authSecretDedicated && !gate.ready) {
    blockers.push("staging_gate_closed");
  }

  const command: StagingNextCommand = {
    command: "pnpm",
    args: ["exec", "next", "dev", "--hostname", "localhost", "--port", "3010", "--webpack"],
  };
  const ready = blockers.length === 0;
  const report: SanitizedLaunchReport = {
    mode,
    ready,
    directHostVerified: direct?.host === HIGH_OCTANE_STAGING_DIRECT_HOST,
    pooledHostVerified: pooled?.host === HIGH_OCTANE_STAGING_POOLED_HOST,
    branchVerified,
    branchId: branchVerified ? HIGH_OCTANE_STAGING_BRANCH_ID : null,
    distDir: resolveNextDistDir(processEnv),
    hostname: HIGH_OCTANE_STAGING_HOSTNAME,
    port: HIGH_OCTANE_STAGING_PORT,
    origin: HIGH_OCTANE_STAGING_ORIGIN,
    devHostnameLeftUntouched: HOUZZAT_DEV_HOSTNAME,
    authSecretPresent,
    authSecretDedicated,
    integrations: Object.entries(FORCED_STAGING_INTEGRATIONS).map(([name, value]) => ({
      name,
      state: integrationState(name, value),
    })),
    blockers,
    nextStarted: false,
    prismaGenerate: false,
    mutableOutputIsolated: resolveNextDistDir(processEnv) !== DEFAULT_NEXT_DIST_DIR,
  };

  return { ok: ready, blockers, childEnv, command, report };
}

export function finishLaunch(
  decision: LaunchDecision,
  mode: LaunchMode,
  spawnProcess: (command: string, args: readonly string[], env: Record<string, string>) => void,
): void {
  switch (mode) {
    case "dry-run":
      return;
    case "start":
      if (!decision.ok) return;
      spawnProcess(decision.command.command, decision.command.args, decision.childEnv);
      return;
    default: {
      const unreachable: never = mode;
      throw new Error(`unsupported launch mode ${String(unreachable)}`);
    }
  }
}
