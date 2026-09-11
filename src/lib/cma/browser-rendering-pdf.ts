/**
 * Stage 5.12B — Cloudflare Browser Rendering PDF client.
 *
 * Preferred when available: Worker `BROWSER` binding (no API token).
 * Vercel / no binding: REST
 *   POST /accounts/{account_id}/browser-rendering/pdf
 *
 * Secrets (REST): CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_BROWSER_RENDERING_API_TOKEN
 * (or CLOUDFLARE_API_TOKEN scoped to Browser Rendering — Edit).
 *
 * Never expose tokens to native/client.
 */

import { tryGetCloudflareEnvSync } from "@/lib/runtime/cloudflare-context";

export type BrowserRenderingPdfResult =
  | { ok: true; bytes: Uint8Array; via: "binding" | "rest" | "mock" }
  | { ok: false; code: string; message: string };

export type BrowserRenderingRestCredentials = {
  accountId: string;
  token: string;
};

type BrowserBinding = {
  /** Workers Bindings quickAction PDF (compat date ≥ 2026-03-24). */
  pdf?: (options: {
    html?: string;
    url?: string;
    pdfOptions?: Record<string, unknown>;
  }) => Promise<ArrayBuffer | Response | Uint8Array>;
  quickAction?: (
    action: "pdf",
    options: Record<string, unknown>,
  ) => Promise<ArrayBuffer | Response | Uint8Array>;
};

type CfEnv = {
  BROWSER?: BrowserBinding;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_BROWSER_RENDERING_API_TOKEN?: string;
  CLOUDFLARE_API_TOKEN?: string;
};

declare global {
  // Test hook — inject mock renderer without live Cloudflare.
  var __cmaBrowserRenderingPdfMock:
    | ((html: string) => Promise<Uint8Array> | Uint8Array)
    | undefined;
}

function readEnv(): CfEnv {
  return (tryGetCloudflareEnvSync() as CfEnv | null) ?? {};
}

function envString(name: keyof CfEnv): string | undefined {
  const bindings = readEnv();
  const fromBinding = bindings[name];
  if (typeof fromBinding === "string" && fromBinding.trim()) {
    return fromBinding.trim();
  }
  const fromProcess = process.env[name as string];
  if (typeof fromProcess === "string" && fromProcess.trim()) {
    return fromProcess.trim();
  }
  return undefined;
}

/** Worker BROWSER binding only. Vercel has no binding — never probe OpenNext. */
function getBrowserBinding(): BrowserBinding | undefined {
  if (process.env.VERCEL) return undefined;
  return readEnv().BROWSER;
}

/** REST credentials from Worker secrets or process.env (Vercel). */
export function readBrowserRenderingRestCredentials(): BrowserRenderingRestCredentials | null {
  const accountId = envString("CLOUDFLARE_ACCOUNT_ID");
  const token =
    envString("CLOUDFLARE_BROWSER_RENDERING_API_TOKEN") ||
    envString("CLOUDFLARE_API_TOKEN");
  if (!accountId || !token) return null;
  return { accountId, token };
}

export function isBrowserRenderingConfigured(): boolean {
  if (typeof globalThis.__cmaBrowserRenderingPdfMock === "function") {
    return true;
  }
  if (getBrowserBinding()) return true;
  return Boolean(readBrowserRenderingRestCredentials());
}

export function browserRenderingConfigStatus(): {
  available: boolean;
  mode: "mock" | "binding" | "rest" | "unconfigured";
  reason: string;
} {
  if (typeof globalThis.__cmaBrowserRenderingPdfMock === "function") {
    return {
      available: true,
      mode: "mock",
      reason: "Test mock renderer installed",
    };
  }
  if (getBrowserBinding()) {
    return {
      available: true,
      mode: "binding",
      reason: "Worker BROWSER binding present",
    };
  }
  if (readBrowserRenderingRestCredentials()) {
    return {
      available: true,
      mode: "rest",
      reason: "REST Browser Rendering credentials present",
    };
  }
  return {
    available: false,
    mode: "unconfigured",
    reason: process.env.VERCEL
      ? "Vercel requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_BROWSER_RENDERING_API_TOKEN"
      : "Configure Worker browser binding OR secrets CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_BROWSER_RENDERING_API_TOKEN",
  };
}

const PDF_OPTIONS = {
  format: "letter",
  printBackground: true,
  displayHeaderFooter: false,
  margin: {
    top: "0.45in",
    bottom: "0.55in",
    left: "0.45in",
    right: "0.45in",
  },
} as const;

async function toBytes(value: unknown): Promise<Uint8Array> {
  if (value instanceof Uint8Array) return value;
  if (typeof Response !== "undefined" && value instanceof Response) {
    return new Uint8Array(await value.arrayBuffer());
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(
      value.buffer,
      value.byteOffset,
      value.byteLength,
    );
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  throw new Error("Unsupported PDF byte source");
}

async function renderViaBinding(
  browser: BrowserBinding,
  html: string,
): Promise<BrowserRenderingPdfResult> {
  try {
    if (typeof browser.pdf === "function") {
      const out = await browser.pdf({
        html,
        pdfOptions: { ...PDF_OPTIONS },
      });
      return { ok: true, bytes: await toBytes(out), via: "binding" };
    }
    if (typeof browser.quickAction === "function") {
      const out = await browser.quickAction("pdf", {
        html,
        pdfOptions: { ...PDF_OPTIONS },
      });
      return { ok: true, bytes: await toBytes(out), via: "binding" };
    }
    return {
      ok: false,
      code: "BINDING_UNSUPPORTED",
      message:
        "BROWSER binding present but pdf/quickAction APIs unavailable for this compatibility date",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Binding PDF failed";
    console.error("[cma-pdf] binding render failed", message);
    return { ok: false, code: "BINDING_FAILED", message: "PDF render failed" };
  }
}

async function renderViaRest(html: string): Promise<BrowserRenderingPdfResult> {
  const creds = readBrowserRenderingRestCredentials();
  if (!creds) {
    return {
      ok: false,
      code: "NOT_CONFIGURED",
      message: "Browser Rendering credentials not configured",
    };
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${creds.accountId}/browser-rendering/pdf`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        html,
        pdfOptions: { ...PDF_OPTIONS },
        gotoOptions: {
          waitUntil: "networkidle0",
          timeout: 45000,
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(
        "[cma-pdf] REST render failed",
        res.status,
        text.slice(0, 400),
      );
      return {
        ok: false,
        code: "RENDER_FAILED",
        message: "Couldn't generate PDF",
      };
    }

    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength < 5 || String.fromCharCode(...bytes.slice(0, 4)) !== "%PDF") {
      console.error("[cma-pdf] REST response was not a PDF");
      return {
        ok: false,
        code: "INVALID_PDF",
        message: "Couldn't generate PDF",
      };
    }
    return { ok: true, bytes, via: "rest" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "REST PDF failed";
    console.error("[cma-pdf] REST exception", message);
    return {
      ok: false,
      code: "RENDER_FAILED",
      message: "Couldn't generate PDF",
    };
  }
}

/** Render print HTML → PDF bytes via Cloudflare Browser Rendering. */
export async function renderHtmlToPdf(
  html: string,
): Promise<BrowserRenderingPdfResult> {
  if (typeof globalThis.__cmaBrowserRenderingPdfMock === "function") {
    try {
      const bytes = await globalThis.__cmaBrowserRenderingPdfMock(html);
      return { ok: true, bytes: await toBytes(bytes), via: "mock" };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Mock PDF failed";
      return { ok: false, code: "MOCK_FAILED", message };
    }
  }

  const browser = getBrowserBinding();
  if (browser) {
    const viaBinding = await renderViaBinding(browser, html);
    if (viaBinding.ok) return viaBinding;
    // Fall through to REST if credentials exist.
    if (!readBrowserRenderingRestCredentials()) return viaBinding;
  }

  return renderViaRest(html);
}
