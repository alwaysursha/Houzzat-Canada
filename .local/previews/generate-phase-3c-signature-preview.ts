/**
 * Phase 3C — local-only generator for agent email signature visual preview.
 * Run from repo root:
 *   node --import tsx .local/previews/generate-phase-3c-signature-preview.ts
 *
 * Does not send email. Does not touch production DB.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  appendAgentSignatureHtml,
  appendAgentSignatureText,
  buildAgentEmailSignature,
} from "@/lib/email/tenant-email-brand";
import { emailLayout } from "@/lib/email/layout";
import {
  LEGACY_HOUZZAT_COLORS,
  LEGACY_HOUZZAT_FOOTER_LEGAL,
} from "@/lib/tenancy/legacy-houzzat-brand";

const WS = "cmt7kfcth0000gvu0bqsycsvz";
const AGENT_ID = "cmunkzqsd000209gm08d0wu13";
const PHOTO =
  "https://branding-assets.houzzatpro.com/workspaces/cmt7kfcth0000gvu0bqsycsvz/branding/agent-profile/9eb6ecd755c37a0c3bb0ad65.jpg";

// Authorized local legacy Houzzat fixtures (not a live production query).
const BROKERAGE = "Royal LePage Credit Valley Real Estate";
const PHONE = "647-221-4949";
const PRIMARY = LEGACY_HOUZZAT_COLORS.primary;
const FOOTER_NOTE = `Ali Syed · ${BROKERAGE}`;

function escapeSrcdoc(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

function escapeText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
}

const personal = buildAgentEmailSignature({
  workspaceId: WS,
  agent: {
    userId: AGENT_ID,
    name: "Ali Syed",
    email: "alisyedrealtor@gmail.com",
    phone: PHONE,
    image: PHOTO,
    designation: null,
  },
  displayName: "Houzzat",
  contactPhone: PHONE,
  senderDisplayName: "Houzzat",
  brokerageRegisteredName: BROKERAGE,
  primaryColor: PRIMARY,
});

const company = buildAgentEmailSignature({
  workspaceId: WS,
  agent: null,
  displayName: "Houzzat",
  contactPhone: PHONE,
  senderDisplayName: "Houzzat",
  brokerageRegisteredName: BROKERAGE,
  primaryColor: PRIMARY,
});

function sampleBody(signatureHtml: string): string {
  return emailLayout({
    title: "A note from your agent",
    subtitle: "A message from Ali Syed",
    preheader: "Checking in on your home search",
    brandLabel: "Houzzat",
    brandPrimaryColor: PRIMARY,
    brandWebsiteUrl: "https://houzzat.com",
    footerNote: FOOTER_NOTE,
    bodyHtml: appendAgentSignatureHtml(
      `
      <p style="margin:0 0 12px;color:#115e59">Hi there,</p>
      <p style="margin:0 0 12px;color:#115e59">I wanted to share a quick update on homes that match what we discussed. Let me know a time that works for a short call this week.</p>
      <p style="margin:0;color:#115e59">Looking forward to helping you find the right place.</p>
    `,
      signatureHtml,
    ),
  });
}

const personalEmail = sampleBody(personal.html);
const companyEmail = sampleBody(company.html);

const checks: Array<[string, boolean]> = [
  [
    "Agent email absent from personal signature HTML",
    !/alisyedrealtor@gmail\.com/i.test(personal.html),
  ],
  [
    "Agent email absent from company signature HTML",
    !/alisyedrealtor@gmail\.com/i.test(company.html),
  ],
  ["Personal signature includes headshot img", /<img /i.test(personal.html)],
  ["Clickable tel: link present", /href="tel:6472214949"/i.test(personal.html)],
  [
    "Fixed 80×80 image dimensions",
    /width="80"/i.test(personal.html) && /height="80"/i.test(personal.html),
  ],
  ["Brokerage present", personal.html.includes(BROKERAGE)],
  ["Agent name present", personal.html.includes("Ali Syed")],
  ["Company fallback has no img", !/<img /i.test(company.html)],
  [
    "Legal footer fixture referenced (separate from signature)",
    LEGACY_HOUZZAT_FOOTER_LEGAL.includes(BROKERAGE),
  ],
];

const outPath = join(
  process.cwd(),
  ".local/previews/phase-3c-agent-email-signature-preview.html",
);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Phase 3C — Houzzat agent email signature preview</title>
  <style>
    :root {
      --ink: #14201c;
      --muted: #475569;
      --line: #d1d5db;
      --bg: #f1f5f9;
      --card: #ffffff;
      --accent: ${PRIMARY};
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
      color: var(--ink);
      background: var(--bg);
      line-height: 1.45;
    }
    header {
      padding: 28px 24px 8px;
      max-width: 1100px;
      margin: 0 auto;
    }
    h1 { margin: 0 0 8px; font-size: 1.5rem; letter-spacing: -0.02em; }
    .meta { color: var(--muted); font-size: 0.92rem; max-width: 70ch; }
    .meta code { font-size: 0.85em; background: #e2e8f0; padding: 1px 5px; border-radius: 4px; }
    .banner {
      margin: 16px 0 0;
      padding: 12px 14px;
      border-left: 4px solid var(--accent);
      background: #ecfdf5;
      color: #064e3b;
      font-size: 0.9rem;
    }
    .checks {
      margin: 18px 0 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: 6px;
      font-size: 0.9rem;
    }
    .ok::before { content: "✓ "; color: #047857; font-weight: 700; }
    .bad::before { content: "✗ "; color: #b91c1c; font-weight: 700; }
    section {
      max-width: 1100px;
      margin: 0 auto;
      padding: 16px 24px 40px;
    }
    h2 { margin: 28px 0 10px; font-size: 1.1rem; }
    .note { color: var(--muted); font-size: 0.88rem; margin: 0 0 12px; }
    .frames { display: grid; grid-template-columns: 1fr; gap: 20px; }
    @media (min-width: 960px) {
      .frames.pair { grid-template-columns: 1.35fr 0.75fr; align-items: start; }
    }
    .frame {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
    }
    .frame-label {
      padding: 10px 14px;
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--muted);
      border-bottom: 1px solid var(--line);
      background: #f8fafc;
    }
    .frame-body { background: #e8f5f0; padding: 16px 12px; overflow: auto; }
    .frame.desktop .viewport { width: 680px; max-width: 100%; margin: 0 auto; }
    .frame.mobile { max-width: 390px; }
    .frame.mobile .viewport { width: 360px; max-width: 100%; margin: 0 auto; }
    .viewport iframe {
      width: 100%;
      border: 0;
      background: transparent;
      display: block;
      min-height: 540px;
    }
    .sig-isolate {
      background: #fff;
      border: 1px dashed #94a3b8;
      border-radius: 8px;
      padding: 20px;
      margin-top: 12px;
    }
    .plain {
      white-space: pre-wrap;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.85rem;
      background: #0f172a;
      color: #e2e8f0;
      padding: 14px 16px;
      border-radius: 8px;
      overflow: auto;
    }
    footer.page {
      max-width: 1100px;
      margin: 0 auto;
      padding: 0 24px 48px;
      color: var(--muted);
      font-size: 0.85rem;
    }
  </style>
</head>
<body>
  <header>
    <h1>Phase 3C — Premium agent email signature preview</h1>
    <p class="meta">
      Rendered via <code>buildAgentEmailSignature</code> (Phase 3B shared renderer).
      Workspace <code>${WS}</code> · Agent <code>${AGENT_ID}</code> · Houzzat.
      Brokerage/phone from local legacy brand fixtures in
      <code>src/lib/tenancy/legacy-houzzat-brand.ts</code> (not a live production query).
    </p>
    <div class="banner">
      Preview only — no emails sent. Agent email
      <code>alisyedrealtor@gmail.com</code> is identity reference and must not appear in the signature.
      Legal footer below the message body is separate (<code>footerNote</code> in email layout).
    </div>
    <ul class="checks">
      ${checks
        .map(
          ([label, ok]) =>
            `<li class="${ok ? "ok" : "bad"}">${escapeText(label)}</li>`,
        )
        .join("\n      ")}
    </ul>
  </header>

  <section>
    <h2>1. Personal signature — realistic email (desktop + mobile)</h2>
    <p class="note">Same rendered email HTML in two viewport frames. Designation omitted (no per-agent field in Phase 3B).</p>
    <div class="frames pair">
      <div class="frame desktop">
        <div class="frame-label">Desktop ~680px email column</div>
        <div class="frame-body"><div class="viewport">
          <iframe title="Personal signature desktop" srcdoc="${escapeSrcdoc(personalEmail)}"></iframe>
        </div></div>
      </div>
      <div class="frame mobile">
        <div class="frame-label">Mobile ~360px</div>
        <div class="frame-body"><div class="viewport">
          <iframe title="Personal signature mobile" srcdoc="${escapeSrcdoc(personalEmail)}"></iframe>
        </div></div>
      </div>
    </div>

    <h2>2. Personal signature — isolated component</h2>
    <p class="note">Raw output of <code>buildAgentEmailSignature</code> (no email chrome).</p>
    <div class="sig-isolate">${personal.html}</div>
    <p class="note" style="margin-top:12px">Plain-text fallback</p>
    <pre class="plain">${escapeText(personal.text)}</pre>

    <h2>3. Company-only fallback — realistic email</h2>
    <p class="note">No agent → company signature, no headshot. Legal footer still separate in layout footer.</p>
    <div class="frames pair">
      <div class="frame desktop">
        <div class="frame-label">Desktop — company signature</div>
        <div class="frame-body"><div class="viewport">
          <iframe title="Company signature desktop" srcdoc="${escapeSrcdoc(companyEmail)}"></iframe>
        </div></div>
      </div>
      <div class="frame mobile">
        <div class="frame-label">Mobile — company signature</div>
        <div class="frame-body"><div class="viewport">
          <iframe title="Company signature mobile" srcdoc="${escapeSrcdoc(companyEmail)}"></iframe>
        </div></div>
      </div>
    </div>
    <div class="sig-isolate">${company.html}</div>
    <pre class="plain">${escapeText(company.text)}</pre>
  </section>

  <footer class="page">
    Generated locally for Phase 3C visual review. Not for production send.
    Plain-text append sample:
    <code>${escapeText(
      appendAgentSignatureText("Body copy.", personal.text).split("\n\n--\n")[1] ??
        "",
    )}</code>
  </footer>
</body>
</html>
`;

writeFileSync(outPath, html, "utf8");

const failed = checks.filter(([, ok]) => !ok);
console.log(
  JSON.stringify(
    {
      outPath,
      allChecksPassed: failed.length === 0,
      checks,
      personalText: personal.text,
      companyText: company.text,
    },
    null,
    2,
  ),
);
if (failed.length > 0) process.exit(1);
