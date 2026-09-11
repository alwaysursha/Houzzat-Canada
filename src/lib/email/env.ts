import { tryGetCloudflareEnvSync } from "@/lib/runtime/cloudflare-context";

type EmailBindings = {
  RESEND_API_KEY?: string;
  RESEND_WEBHOOK_SECRET?: string;
  EMAIL_FROM?: string;
  EMAIL_FROM_NOTIFY?: string;
  EMAIL_FROM_ALERTS?: string;
  EMAIL_ADMIN_TO?: string;
  /** Stage 6.6C — internal Book a Demo notification recipient. */
  HOUZZATPRO_DEMO_NOTIFICATION_EMAIL?: string;
  /** Optional HouzzatPRO platform From identity (verified domain required). */
  HOUZZATPRO_EMAIL_FROM?: string;
};

function readBindings(): EmailBindings {
  return (tryGetCloudflareEnvSync() as EmailBindings | null) ?? {};
}

/** Prefer Worker bindings, then process.env (local / scripts). */
export function emailEnv(name: keyof EmailBindings): string | undefined {
  const fromBinding = readBindings()[name];
  if (typeof fromBinding === "string" && fromBinding.trim()) {
    return fromBinding.trim();
  }
  const fromProcess = process.env[name];
  if (typeof fromProcess === "string" && fromProcess.trim()) {
    return fromProcess.trim();
  }
  return undefined;
}
