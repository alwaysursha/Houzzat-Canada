import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://127.0.0.1:3000";
  console.log("probe site host:", new URL(site).host);
  console.log(
    "tenant domain scope flag env present:",
    Object.keys(process.env).some((k) => /TENANT|WORKSPACE|HOSTNAME/i.test(k)),
  );

  const { isTenantDomainScopeWorkspace } = await import(
    "@/lib/tenancy/tenant-scope-flags"
  );
  console.log("isTenantDomainScopeWorkspace:", isTenantDomainScopeWorkspace());

  const { resolveRequestTenancy } = await import(
    "@/lib/tenancy/resolve-request-tenancy"
  );
  try {
    const req = new Request(site.endsWith("/") ? site : `${site}/`);
    const result = await resolveRequestTenancy(req);
    console.log(
      "resolveRequestTenancy:",
      result.ok
        ? {
            ok: true,
            hostname: result.hostname,
            workspaceId: result.workspaceId,
          }
        : result,
    );
  } catch (error) {
    const err = error as {
      name?: string;
      message?: string;
      constructor?: { name?: string };
      type?: string;
      error?: { message?: string };
      stack?: string;
    };
    console.log("resolveRequestTenancy THREW", {
      ctor: err?.constructor?.name,
      name: err?.name,
      message: err?.message,
      type: err?.type,
      nested: err?.error?.message,
    });
    console.log(String(err?.stack || err).split("\n").slice(0, 40).join("\n"));
  }

  const { resolveMarketingTenancy } = await import(
    "@/lib/tenancy/resolve-marketing-tenancy"
  );
  try {
    const tenancy = await resolveMarketingTenancy();
    console.log(
      "resolveMarketingTenancy:",
      tenancy
        ? { hostname: tenancy.hostname, workspaceId: tenancy.workspaceId }
        : null,
    );
  } catch (error) {
    const err = error as {
      name?: string;
      message?: string;
      constructor?: { name?: string };
      type?: string;
      error?: { message?: string };
      stack?: string;
    };
    console.log("resolveMarketingTenancy THREW", {
      ctor: err?.constructor?.name,
      name: err?.name,
      message: err?.message,
      type: err?.type,
      nested: err?.error?.message,
    });
    console.log(String(err?.stack || err).split("\n").slice(0, 40).join("\n"));
  }
}

main().catch((error) => {
  console.error("probe failed", error);
  process.exit(1);
});
