/**
 * Dual-runtime CMA PDF: Worker BROWSER binding first, Vercel REST fallback.
 * Run: node --import tsx scripts/vercel-cma-pdf-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  browserRenderingConfigStatus,
  isBrowserRenderingConfigured,
  readBrowserRenderingRestCredentials,
  renderHtmlToPdf,
} from "../src/lib/cma/browser-rendering-pdf";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const ENV_KEYS = [
  "VERCEL",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_BROWSER_RENDERING_API_TOKEN",
  "CLOUDFLARE_API_TOKEN",
] as const;

const savedEnv: Record<string, string | undefined> = {};

function snapshotEnv() {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
  }
}

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const value = savedEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  delete globalThis.__cmaBrowserRenderingPdfMock;
}

function clearRestEnv() {
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  delete process.env.CLOUDFLARE_BROWSER_RENDERING_API_TOKEN;
  delete process.env.CLOUDFLARE_API_TOKEN;
}

function setVercelRestEnv(opts?: {
  accountId?: string;
  token?: string;
  fallbackToken?: string;
}) {
  process.env.VERCEL = "1";
  clearRestEnv();
  if (opts?.accountId) process.env.CLOUDFLARE_ACCOUNT_ID = opts.accountId;
  if (opts?.token) {
    process.env.CLOUDFLARE_BROWSER_RENDERING_API_TOKEN = opts.token;
  }
  if (opts?.fallbackToken) {
    process.env.CLOUDFLARE_API_TOKEN = opts.fallbackToken;
  }
}

type CapturedRequest = {
  method: string;
  url: string;
  contentType: string | null;
  authorization: string | null;
  body: unknown;
};

async function main() {
  console.log("\n=== VERCEL CMA PDF BROWSER RENDERING ===\n");
  snapshotEnv();

  const src = read("src/lib/cma/browser-rendering-pdf.ts");
  const wrangler = read("wrangler.jsonc");
  const envExample = read(".env.example");
  const route = read("src/app/api/mobile/v2/cma/[id]/pdf/route.ts");

  assert.ok(src.includes("tryGetCloudflareEnvSync"));
  assert.ok(src.includes("getBrowserBinding"));
  assert.ok(src.includes("process.env.VERCEL"));
  assert.ok(src.includes("browser-rendering/pdf"));
  assert.ok(src.includes("CLOUDFLARE_ACCOUNT_ID"));
  assert.ok(src.includes("CLOUDFLARE_BROWSER_RENDERING_API_TOKEN"));
  const bindingIdx = src.indexOf("getBrowserBinding()");
  const restIdx = src.indexOf("renderViaRest(");
  assert.ok(bindingIdx > 0);
  assert.ok(restIdx > bindingIdx);
  assert.ok(wrangler.includes('"binding": "BROWSER"'));
  assert.ok(wrangler.includes("CLOUDFLARE_BROWSER_RENDERING_API_TOKEN"));
  assert.ok(envExample.includes("CLOUDFLARE_ACCOUNT_ID"));
  assert.ok(envExample.includes("CLOUDFLARE_BROWSER_RENDERING_API_TOKEN"));
  assert.ok(route.includes("maxDuration = 60"));
  console.log("[0] Binding-first + Vercel REST surface... PASS");

  {
    delete process.env.VERCEL;
    setVercelRestEnv({
      accountId: "acct_test",
      token: "token_test",
    });
    delete process.env.VERCEL;
    const creds = readBrowserRenderingRestCredentials();
    assert.ok(creds);
    assert.equal(creds.accountId, "acct_test");
    restoreEnv();
    snapshotEnv();
    console.log("[1] REST creds still readable off Vercel (CF fallback)... PASS");
  }

  {
    setVercelRestEnv({ accountId: "acct_test" });
    assert.equal(readBrowserRenderingRestCredentials(), null);
    assert.equal(isBrowserRenderingConfigured(), false);
    const status = browserRenderingConfigStatus();
    assert.equal(status.available, false);
    assert.equal(status.mode, "unconfigured");
    assert.match(status.reason, /Vercel requires CLOUDFLARE_ACCOUNT_ID/);
    const rendered = await renderHtmlToPdf("<html><body>cma</body></html>");
    assert.equal(rendered.ok, false);
    if (!rendered.ok) {
      assert.equal(rendered.code, "NOT_CONFIGURED");
    }
    restoreEnv();
    snapshotEnv();
    console.log("[2] Vercel missing token fail-closed... PASS");
  }

  {
    setVercelRestEnv({
      token: "token_test",
    });
    assert.equal(readBrowserRenderingRestCredentials(), null);
    assert.equal(isBrowserRenderingConfigured(), false);
    restoreEnv();
    snapshotEnv();
    console.log("[3] Vercel missing account id fail-closed... PASS");
  }

  {
    setVercelRestEnv({
      accountId: "acct_test",
      fallbackToken: "fallback_token",
    });
    const creds = readBrowserRenderingRestCredentials();
    assert.ok(creds);
    assert.equal(creds.token, "fallback_token");
    restoreEnv();
    snapshotEnv();
    console.log("[4] CLOUDFLARE_API_TOKEN fallback accepted... PASS");
  }

  {
    const captured: CapturedRequest[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input, init) => {
      const req = new Request(input, init);
      captured.push({
        method: req.method,
        url: req.url,
        contentType: req.headers.get("content-type"),
        authorization: req.headers.get("authorization"),
        body: JSON.parse(await req.text()),
      });
      return new Response("%PDF-1.4 rest-ok", {
        status: 200,
        headers: { "Content-Type": "application/pdf" },
      });
    }) as typeof fetch;

    setVercelRestEnv({
      accountId: "acct_vercel",
      token: "br_token",
    });
    assert.equal(isBrowserRenderingConfigured(), true);
    assert.equal(browserRenderingConfigStatus().mode, "rest");

    const html = "<html><body>CMA letter</body></html>";
    const rendered = await renderHtmlToPdf(html);
    assert.equal(rendered.ok, true);
    if (rendered.ok) {
      assert.equal(rendered.via, "rest");
      assert.equal(String.fromCharCode(...rendered.bytes.slice(0, 4)), "%PDF");
    }
    assert.equal(captured.length, 1);
    assert.equal(captured[0]?.method, "POST");
    assert.equal(
      captured[0]?.url,
      "https://api.cloudflare.com/client/v4/accounts/acct_vercel/browser-rendering/pdf",
    );
    assert.equal(captured[0]?.authorization, "Bearer br_token");
    assert.equal(captured[0]?.contentType, "application/json");
    const body = captured[0]?.body as {
      html: string;
      pdfOptions: { format: string; printBackground: boolean };
      gotoOptions: { waitUntil: string; timeout: number };
    };
    assert.equal(body.html, html);
    assert.equal(body.pdfOptions.format, "letter");
    assert.equal(body.pdfOptions.printBackground, true);
    assert.equal(body.gotoOptions.waitUntil, "networkidle0");
    assert.equal(body.gotoOptions.timeout, 45000);

    globalThis.fetch = originalFetch;
    restoreEnv();
    snapshotEnv();
    console.log("[5] Vercel REST POST registered with existing PDF options... PASS");
  }

  {
    const captured: CapturedRequest[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      captured.push({
        method: "POST",
        url: "should-not-run",
        contentType: null,
        authorization: null,
        body: null,
      });
      return new Response("%PDF-1.4", { status: 200 });
    }) as typeof fetch;

    delete process.env.VERCEL;
    clearRestEnv();
    process.env.CLOUDFLARE_ACCOUNT_ID = "acct_cf";
    process.env.CLOUDFLARE_BROWSER_RENDERING_API_TOKEN = "br_token";

    globalThis.__cmaBrowserRenderingPdfMock = async () =>
      new TextEncoder().encode("%PDF-1.4 mock");
    const rendered = await renderHtmlToPdf("<html></html>");
    assert.equal(rendered.ok, true);
    if (rendered.ok) {
      assert.equal(rendered.via, "mock");
    }
    assert.equal(captured.length, 0);

    globalThis.fetch = originalFetch;
    restoreEnv();
    snapshotEnv();
    console.log("[6] Mock still short-circuits before REST... PASS");
  }

  console.log("\nVERCEL CMA PDF SELFTEST PASSED\n");
}

main().catch((err) => {
  console.error("\nVERCEL CMA PDF SELFTEST FAILED\n");
  console.error(err);
  restoreEnv();
  process.exit(1);
});
