import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

export async function GET() {
  let bindingKeys: string[] = [];
  let hasBindingDatabaseUrl = false;
  let databaseUrlType: string | null = null;
  let databaseUrlLength: number | null = null;
  let contextError: string | null = null;

  try {
    const { env } = await getCloudflareContext({ async: true });
    const bindings = env as unknown as Record<string, unknown>;
    bindingKeys = Object.keys(bindings).sort();
    const databaseUrl = bindings.DATABASE_URL;
    databaseUrlType = typeof databaseUrl;
    databaseUrlLength =
      typeof databaseUrl === "string" ? databaseUrl.length : null;
    hasBindingDatabaseUrl =
      typeof databaseUrl === "string" && databaseUrl.trim().length > 0;
  } catch (error) {
    contextError =
      error instanceof Error ? error.message : "Failed to read Cloudflare context";
  }

  return NextResponse.json({
    ok: true,
    hasProcessEnvDatabaseUrl: Boolean(process.env.DATABASE_URL),
    processEnvDatabaseUrlLength: process.env.DATABASE_URL?.length ?? 0,
    hasBindingDatabaseUrl,
    databaseUrlType,
    databaseUrlLength,
    hasAuthSecret: Boolean(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET),
    bindingKeys,
    contextError,
  });
}
