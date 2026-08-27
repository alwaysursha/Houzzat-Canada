"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Capacitor } from "@capacitor/core";
import { usePathname, useSearchParams } from "next/navigation";
import {
  HOUZZATPRO_APP_ID,
  nativeAppIdFromUserAgent,
  resolveAppShell,
  type AppShell,
} from "@/lib/mobile/app-shell";
import {
  classifyBootstrapHost,
  clearMobileDiagTrace,
  detectRefreshLoop,
  expectedMobileDestination,
  isPlatformBootstrapHostOk,
  maskEmail,
  maskUserId,
  readMobileDiagNav,
  readMobileDiagTrace,
  recordMobileDiagEvent,
  recordMobileDiagNav,
  sanitizeDiagnosticHref,
  summarizeBootstrapPayload,
  summarizeSessionPayload,
  type MobileDiagEvent,
  type SafeBootstrapProbe,
  type SafeSessionProbe,
} from "@/lib/mobile/runtime-diagnostic";

type WorkspaceSafe = {
  slug: string | null;
  role: string | null;
  active: boolean;
  count: number;
  canonicalHostname: string | null;
  hostMatchesCanonical: boolean | null;
  bootstrapKind: string | null;
  destination: string | null;
  handoffRequired: boolean | null;
};

type CrmContextSafe = {
  available: boolean;
  workspaceSlug: string | null;
  workspaceRole: string | null;
  httpStatus: number | null;
};

type DiagSnapshot = {
  origin: string;
  host: string;
  pathname: string;
  hrefSafe: string;
  native: boolean;
  capacitorPlatform: string;
  shell: AppShell;
  packageId: string | null;
  uaMarker: string | null;
  platformHostOk: boolean;
  hostClass: ReturnType<typeof classifyBootstrapHost>;
  authenticated: boolean;
  globalRole: string | null;
  userIdMasked: string | null;
  emailMasked: string | null;
  sessionProbe: SafeSessionProbe;
  bootstrapProbe: SafeBootstrapProbe;
  workspace: WorkspaceSafe;
  crm: CrmContextSafe;
  tenantSessionEstablished: boolean | null;
  trace: MobileDiagEvent[];
  loop: ReturnType<typeof detectRefreshLoop>;
  logoutNote: string;
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <p className="break-all">
      <span className="font-semibold text-amber-900">{label}: </span>
      <span>{value}</span>
    </p>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-2 border-t border-amber-200 pt-2">
      <p className="mb-1 font-bold uppercase tracking-wide text-amber-900">
        {title}
      </p>
      {children}
    </section>
  );
}

async function probeSession(): Promise<SafeSessionProbe> {
  try {
    const res = await fetch("/api/auth/session", {
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const body: unknown = await res.json().catch(() => null);
    return summarizeSessionPayload(res.status, body);
  } catch {
    return {
      httpStatus: null,
      authenticated: null,
      role: null,
      userIdMasked: null,
      emailMasked: null,
      error: "network",
    };
  }
}

async function probeBootstrap(): Promise<SafeBootstrapProbe> {
  try {
    const res = await fetch("/api/mobile/workspace-bootstrap", {
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const body: unknown = await res.json().catch(() => null);
    return summarizeBootstrapPayload(res.status, body);
  } catch {
    return {
      httpStatus: null,
      authenticated: null,
      bootstrapKind: null,
      membershipCount: null,
      workspaceSlugs: [],
      primaryRole: null,
      canonicalHostname: null,
      intendedDestination: null,
      handoffRequired: null,
      error: "network",
    };
  }
}

async function probeCrmContext(): Promise<CrmContextSafe> {
  try {
    const res = await fetch("/api/agent/workspace", {
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (res.status === 401 || res.status === 403) {
      return {
        available: false,
        workspaceSlug: null,
        workspaceRole: null,
        httpStatus: res.status,
      };
    }
    if (!res.ok) {
      return {
        available: false,
        workspaceSlug: null,
        workspaceRole: null,
        httpStatus: res.status,
      };
    }
    const body = (await res.json()) as {
      memberships?: Array<{ slug?: string; role?: string }>;
      hostnameBound?: boolean;
    };
    const first = body.memberships?.[0];
    return {
      available: true,
      workspaceSlug: first?.slug ?? null,
      workspaceRole: first?.role ?? null,
      httpStatus: res.status,
    };
  } catch {
    return {
      available: false,
      workspaceSlug: null,
      workspaceRole: null,
      httpStatus: null,
    };
  }
}

function workspaceFromBootstrap(
  probe: SafeBootstrapProbe,
  host: string,
): WorkspaceSafe {
  const slug = probe.workspaceSlugs[0] ?? null;
  const role = probe.primaryRole;
  const canonicalHostname = probe.canonicalHostname;
  return {
    slug,
    role,
    active: (probe.membershipCount ?? 0) > 0,
    count: probe.membershipCount ?? 0,
    canonicalHostname,
    hostMatchesCanonical:
      canonicalHostname != null ? host === canonicalHostname : null,
    bootstrapKind: probe.bootstrapKind,
    destination: probe.intendedDestination,
    handoffRequired: probe.handoffRequired,
  };
}

/**
 * Safe in-app HouzzatPRO runtime diagnostic.
 * Entry: /pro?diag=1 or /pro/mobile/diag (native HouzzatPRO shell).
 */
export function ProShellRuntimeDiagnostic({
  forceEnabled = false,
}: {
  forceEnabled?: boolean;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname() || "/";
  const diagParam = searchParams.get("diag") === "1";
  const onDiagPage =
    pathname === "/pro/mobile/diag" || pathname === "/pro/mobile/diag/";
  const enabled = forceEnabled || diagParam || onDiagPage;
  const { data, status: sessionStatus } = useSession();
  const [snap, setSnap] = useState<DiagSnapshot | null>(null);
  const [denied, setDenied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setBusy(true);
    recordMobileDiagNav();

    const shell = await resolveAppShell();
    const native = Capacitor.isNativePlatform();
    const packageId =
      nativeAppIdFromUserAgent(navigator.userAgent) ??
      (native ? Capacitor.getPlatform() : null);
    const isProShell =
      shell === "houzzatpro" ||
      packageId === HOUZZATPRO_APP_ID ||
      /com\.houzzat\.pro/i.test(navigator.userAgent);

    // Physical app only — avoid exposing diagnostic chrome on public web.
    if (!native || !isProShell) {
      setDenied(
        native
          ? "Diagnostic requires HouzzatPRO shell (com.houzzat.pro)."
          : "Diagnostic requires the HouzzatPRO native app (?diag=1).",
      );
      setSnap(null);
      setBusy(false);
      return;
    }
    setDenied(null);

    recordMobileDiagEvent("APP_BOOT", "diag_refresh");

    const host = window.location.hostname;
    const sessionProbe = await probeSession();
    if (sessionProbe.authenticated) {
      recordMobileDiagEvent(
        isPlatformBootstrapHostOk(host)
          ? "PLATFORM_SESSION_FOUND"
          : "TENANT_SESSION_FOUND",
      );
    } else {
      recordMobileDiagEvent(
        isPlatformBootstrapHostOk(host)
          ? "PLATFORM_SESSION_MISSING"
          : "TENANT_SESSION_MISSING",
      );
    }

    const bootstrapProbe = await probeBootstrap();
    if (bootstrapProbe.bootstrapKind) {
      recordMobileDiagEvent("WORKSPACE_BOOTSTRAP_START", bootstrapProbe.bootstrapKind);
      const count = bootstrapProbe.membershipCount ?? 0;
      if (count === 0) recordMobileDiagEvent("WORKSPACE_COUNT_0");
      else if (count === 1) recordMobileDiagEvent("WORKSPACE_COUNT_1");
      else if (count > 1) recordMobileDiagEvent("WORKSPACE_SELECTOR");
    }

    const crm = await probeCrmContext();
    const workspace = workspaceFromBootstrap(bootstrapProbe, host);
    if (crm.workspaceRole) {
      workspace.role = crm.workspaceRole;
    }
    if (crm.workspaceSlug && !workspace.slug) {
      workspace.slug = crm.workspaceSlug;
    }
    if (workspace.role === "OWNER" || workspace.role === "ADMIN") {
      workspace.destination = "/admin";
    } else if (workspace.role === "AGENT") {
      workspace.destination = "/agent";
    }

    const expected = expectedMobileDestination({
      workspaceSlug: workspace.slug,
      workspaceRole: workspace.role,
    });
    if (expected) {
      workspace.canonicalHostname = expected.hostHint;
      workspace.destination = expected.path;
      workspace.hostMatchesCanonical =
        host === expected.hostHint ||
        (expected.hostHint === "houzzat.com" &&
          (host === "www.houzzat.com" || host === "houzzat.houzzatpro.com"));
    }

    const trace = readMobileDiagTrace();
    const nav = readMobileDiagNav();
    const loop = detectRefreshLoop(nav);

    setSnap({
      origin: window.location.origin,
      host,
      pathname: window.location.pathname,
      hrefSafe: sanitizeDiagnosticHref(window.location.href),
      native,
      capacitorPlatform: Capacitor.getPlatform(),
      shell,
      packageId,
      uaMarker: /HouzzatNative\/\d+/.test(navigator.userAgent)
        ? navigator.userAgent.match(/HouzzatNative\/\d+[^(]*\([^)]*\)/)?.[0] ??
          "HouzzatNative"
        : null,
      platformHostOk: isPlatformBootstrapHostOk(host),
      hostClass: classifyBootstrapHost(host),
      authenticated: Boolean(
        sessionProbe.authenticated ?? sessionStatus === "authenticated",
      ),
      globalRole:
        sessionProbe.role ??
        (typeof data?.user?.role === "string" ? data.user.role : null),
      userIdMasked:
        sessionProbe.userIdMasked ??
        maskUserId(
          typeof data?.user?.id === "string" ? data.user.id : null,
        ),
      emailMasked:
        sessionProbe.emailMasked ??
        maskEmail(
          typeof data?.user?.email === "string" ? data.user.email : null,
        ),
      sessionProbe,
      bootstrapProbe,
      workspace,
      crm,
      tenantSessionEstablished: isPlatformBootstrapHostOk(host)
        ? null
        : sessionProbe.authenticated,
      trace,
      loop,
      logoutNote:
        "Logout clears Auth.js cookies on the CURRENT host only. Sign out on tenant host AND relaunch/sign out on houzzatpro.com/pro for a clean A/B test.",
    });
    setBusy(false);
  }, [enabled, data?.user?.role, data?.user?.id, data?.user?.email, sessionStatus]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
  }, [enabled, refresh]);

  if (!enabled) return null;

  if (denied) {
    return (
      <aside
        aria-label="HouzzatPRO mobile diagnostic unavailable"
        className="fixed bottom-0 left-0 right-0 z-[9999] border-t border-amber-300 bg-amber-50 px-3 py-2 font-mono text-[11px] text-amber-950"
      >
        <p className="font-semibold">HouzzatPRO Mobile Diagnostics</p>
        <p>{denied}</p>
      </aside>
    );
  }

  if (!snap) {
    return (
      <aside
        aria-label="HouzzatPRO mobile diagnostic loading"
        className="fixed bottom-0 left-0 right-0 z-[9999] border-t border-amber-300 bg-amber-50 px-3 py-2 font-mono text-[11px] text-amber-950"
      >
        <p>Loading diagnostics…</p>
      </aside>
    );
  }

  const panelClass = onDiagPage
    ? "relative z-10 mx-auto max-h-none w-full max-w-lg overflow-auto border border-amber-300 bg-amber-50 px-3 py-3 font-mono text-[11px] leading-snug text-amber-950"
    : "fixed bottom-0 left-0 right-0 z-[9999] max-h-[55dvh] overflow-auto border-t border-amber-300 bg-amber-50 px-3 py-2 font-mono text-[10px] leading-snug text-amber-950";

  return (
    <aside aria-label="HouzzatPRO mobile runtime diagnostic" className={panelClass}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-bold text-amber-950">HouzzatPRO Mobile Diagnostics</p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void refresh()}
            className="rounded border border-amber-400 bg-white px-2 py-0.5 text-[10px] font-semibold"
          >
            {busy ? "…" : "Refresh"}
          </button>
          <button
            type="button"
            onClick={() => {
              clearMobileDiagTrace();
              void refresh();
            }}
            className="rounded border border-amber-400 bg-white px-2 py-0.5 text-[10px] font-semibold"
          >
            Clear trace
          </button>
        </div>
      </div>

      <Section title="Runtime">
        <Row label="origin" value={snap.origin} />
        <Row label="host" value={snap.host} />
        <Row label="pathname" value={snap.pathname} />
        <Row label="href" value={snap.hrefSafe} />
        <Row label="native" value={String(snap.native)} />
        <Row label="capacitor" value={snap.capacitorPlatform} />
        <Row label="shell" value={snap.shell} />
        <Row label="package" value={snap.packageId ?? "(unknown)"} />
        <Row label="ua_marker" value={snap.uaMarker ?? "(none)"} />
        <Row
          label="PLATFORM_BOOTSTRAP_HOST_OK"
          value={String(snap.platformHostOk)}
        />
        <Row label="host_class" value={snap.hostClass.label} />
      </Section>

      <Section title="Platform / Auth session">
        <Row label="authenticated" value={String(snap.authenticated)} />
        <Row label="User.role" value={snap.globalRole ?? "(none)"} />
        <Row label="userId" value={snap.userIdMasked ?? "(none)"} />
        <Row label="email" value={snap.emailMasked ?? "(none)"} />
        <Row
          label="session_http"
          value={String(snap.sessionProbe.httpStatus ?? "n/a")}
        />
      </Section>

      <Section title="Workspace / Bootstrap">
        <Row
          label="bootstrap_http"
          value={String(snap.bootstrapProbe.httpStatus ?? "n/a")}
        />
        <Row
          label="bootstrap_kind"
          value={snap.workspace.bootstrapKind ?? "(none)"}
        />
        <Row label="membership_count" value={String(snap.workspace.count)} />
        <Row label="ACTIVE" value={String(snap.workspace.active)} />
        <Row label="workspace_slug" value={snap.workspace.slug ?? "(none)"} />
        <Row label="wm_role" value={snap.workspace.role ?? "(none)"} />
        <Row
          label="canonical_host"
          value={snap.workspace.canonicalHostname ?? "(none)"}
        />
        <Row
          label="host_matches_canonical"
          value={
            snap.workspace.hostMatchesCanonical == null
              ? "(n/a)"
              : String(snap.workspace.hostMatchesCanonical)
          }
        />
        <Row
          label="handoff_required"
          value={
            snap.workspace.handoffRequired == null
              ? "(n/a)"
              : String(snap.workspace.handoffRequired)
          }
        />
        <Row
          label="intended_destination"
          value={snap.workspace.destination ?? "(none)"}
        />
        <Row
          label="slugs"
          value={
            snap.bootstrapProbe.workspaceSlugs.length
              ? snap.bootstrapProbe.workspaceSlugs.join(", ")
              : "(none)"
          }
        />
      </Section>

      <Section title="Handoff / Tenant">
        <Row
          label="tenant_session"
          value={
            snap.tenantSessionEstablished == null
              ? "(on platform host — n/a)"
              : String(snap.tenantSessionEstablished)
          }
        />
        <Row label="crm_context" value={String(snap.crm.available)} />
        <Row
          label="crm_http"
          value={String(snap.crm.httpStatus ?? "n/a")}
        />
        <Row
          label="crm_slug"
          value={snap.crm.workspaceSlug ?? "(none)"}
        />
        <Row
          label="crm_role"
          value={snap.crm.workspaceRole ?? "(none)"}
        />
        <p className="mt-1 text-amber-800">
          Handoff mint/exchange categories appear in Navigation Trace when the
          login flow runs (no codes stored).
        </p>
      </Section>

      <Section title="Navigation / Loop">
        <Row
          label="POSSIBLE_REFRESH_LOOP"
          value={String(snap.loop.possible)}
        />
        {snap.loop.repeatingKey ? (
          <Row label="repeating" value={snap.loop.repeatingKey} />
        ) : null}
        <p className="mt-1 whitespace-pre-wrap text-amber-900">
          {snap.loop.chain.length
            ? snap.loop.chain.join("\n→ ")
            : "(no nav steps yet)"}
        </p>
      </Section>

      <Section title="Event Trace">
        {snap.trace.length === 0 ? (
          <p>(empty — run login/bootstrap flow, then Refresh)</p>
        ) : (
          snap.trace
            .slice()
            .reverse()
            .map((ev, i) => (
              <p key={`${ev.at}-${ev.type}-${i}`} className="break-all">
                {new Date(ev.at).toISOString().slice(11, 19)} {ev.type}{" "}
                {ev.host}
                {ev.path}
                {ev.reason ? ` · ${ev.reason}` : ""}
              </p>
            ))
        )}
      </Section>

      <Section title="Logout note">
        <p>{snap.logoutNote}</p>
      </Section>
    </aside>
  );
}
