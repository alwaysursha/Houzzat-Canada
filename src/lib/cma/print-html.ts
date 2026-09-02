/**
 * Stage 5.12B — Letter-size CMA print HTML for Browser Rendering PDF.
 */

import { formatPrice } from "@/lib/listings/constants";
import type { CmaPresentationDto } from "@/lib/cma/presentation";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(n: number | null | undefined): string {
  if (n == null) return "—";
  return formatPrice(n);
}

function photoBlock(
  url: string | null,
  alt: string,
  className: string,
): string {
  if (!url) {
    return `<div class="${className} photo-fallback" role="img" aria-label="${esc(alt)}">Photo unavailable</div>`;
  }
  return `<img class="${className}" src="${esc(url)}" alt="${esc(alt)}" loading="eager" onerror="this.onerror=null;this.replaceWith(Object.assign(document.createElement('div'),{className:'${className} photo-fallback',textContent:'Photo unavailable'}))" />`;
}

function compCard(c: CmaPresentationDto["soldComps"][number], kind: "sold" | "active"): string {
  const price =
    kind === "sold" && c.soldPrice != null
      ? money(c.soldPrice)
      : money(c.listPrice);
  const priceLabel = kind === "sold" ? "Sold" : "Asking";
  const meta: string[] = [
    `${c.distanceKm.toFixed(1)} km`,
    `${c.beds} bd / ${c.baths} ba`,
  ];
  if (c.sqft != null) meta.push(`${c.sqft.toLocaleString("en-CA")} sqft`);
  if (c.lotSizeArea) meta.push(`Lot ${c.lotSizeArea}`);
  if (c.maintenanceFee != null) meta.push(`Maint. ${money(c.maintenanceFee)}`);
  if (c.pricePerSqft != null && kind === "sold") {
    meta.push(`${money(c.pricePerSqft)}/sqft`);
  }
  if (c.daysOnMarket != null) meta.push(`${c.daysOnMarket} DOM`);
  if (c.soldAt && kind === "sold") {
    meta.push(
      `Sold ${new Date(c.soldAt).toLocaleDateString("en-CA")}`,
    );
  }
  return `
    <article class="comp-card avoid-break">
      ${photoBlock(c.photoUrl, c.addressLine, "comp-photo")}
      <div class="comp-body">
        <h3>${esc(c.addressLine)}${c.unitNumber ? `, Unit ${esc(c.unitNumber)}` : ""}</h3>
        <p class="comp-city">${esc(c.city)}${c.community ? ` · ${esc(c.community)}` : ""}</p>
        <p class="comp-price"><span>${priceLabel}</span> ${esc(price)}</p>
        <p class="comp-meta">${esc(meta.join(" · "))}</p>
        <p class="comp-match">${esc(c.matchExplanation)}</p>
        ${c.outlier ? `<p class="outlier">Possible outlier${c.outlierReason ? `: ${esc(c.outlierReason)}` : ""}</p>` : ""}
        ${c.source === "AGENT" ? `<p class="badge">Agent selected</p>` : ""}
      </div>
    </article>`;
}

/**
 * Dedicated print presentation — Letter, page breaks, print typography.
 * Not a dump of the responsive public page.
 */
export function renderCmaPrintHtml(dto: CmaPresentationDto): string {
  const primary = dto.brand.primaryColor;
  const subjectFull = [
    dto.subject.addressLine,
    dto.subject.unitNumber ? `Unit ${dto.subject.unitNumber}` : null,
    dto.subject.city,
  ]
    .filter(Boolean)
    .join(", ");

  const analysisMetrics = dto.analysis
    ? `
      <div class="metrics">
        <div class="metric"><span>Selected sold comps</span><strong>${dto.analysis.soldCompCount}</strong></div>
        <div class="metric"><span>Median sold price</span><strong>${esc(money(dto.analysis.medianSoldPrice))}</strong></div>
        <div class="metric"><span>Median $/sqft</span><strong>${esc(money(dto.analysis.medianPricePerSqft))}</strong></div>
        <div class="metric"><span>Observed range</span><strong>${esc(money(dto.analysis.observedSoldLow))} – ${esc(money(dto.analysis.observedSoldHigh))}</strong></div>
        <div class="metric"><span>System-supported indicated range</span><strong>${esc(money(dto.analysis.indicatedLow))} – ${esc(money(dto.analysis.indicatedHigh))}</strong></div>
        <div class="metric"><span>Evidence quality</span><strong>${esc(dto.analysis.confidence)}</strong></div>
      </div>
      <p class="context">${esc(dto.analysis.marketContext)}</p>
      ${dto.analysis.confidenceReasons.length ? `<p class="subtle">${esc(dto.analysis.confidenceReasons.join("; "))}</p>` : ""}
      ${dto.analysis.limitedInventory ? `<p class="warn">Limited comparable inventory — search criteria were widened.</p>` : ""}
    `
    : `<p class="subtle">Market analysis snapshot unavailable.</p>`;

  const comparisonHead =
    dto.soldComps.length === 0
      ? ""
      : `<tr><th>Field</th><th>Subject</th>${dto.soldComps
          .slice(0, 5)
          .map((_, i) => `<th>Comp ${i + 1}</th>`)
          .join("")}</tr>`;

  const comparisonBody = dto.comparisonRows
    .map(
      (row) =>
        `<tr><td>${esc(row.label)}</td><td>${esc(row.subject)}</td>${row.comps
          .map((v) => `<td>${esc(v)}</td>`)
          .join("")}</tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>CMA — ${esc(subjectFull)}</title>
  <style>
    @page {
      size: Letter;
      margin: 0.55in 0.6in 0.7in 0.6in;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      color: #14201C;
      font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
      font-size: 11pt;
      line-height: 1.45;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    h1, h2, h3 {
      font-family: "Avenir Next", "Segoe UI", Helvetica, Arial, sans-serif;
      font-weight: 650;
      letter-spacing: -0.01em;
      margin: 0 0 0.35em;
    }
    h1 { font-size: 26pt; color: ${esc(primary)}; }
    h2 {
      font-size: 15pt;
      color: ${esc(primary)};
      border-bottom: 2px solid ${esc(primary)};
      padding-bottom: 0.2em;
      margin-top: 0;
    }
    h3 { font-size: 11.5pt; }
    p { margin: 0 0 0.55em; }
    .page { page-break-after: always; }
    .page:last-child { page-break-after: auto; }
    .cover {
      min-height: 9.2in;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .brand-row {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .brand-logo {
      max-height: 52px;
      max-width: 180px;
      object-fit: contain;
    }
    .brand-name {
      font-family: "Avenir Next", "Segoe UI", Helvetica, Arial, sans-serif;
      font-size: 14pt;
      font-weight: 700;
      color: ${esc(primary)};
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .eyebrow {
      font-family: "Avenir Next", "Segoe UI", Helvetica, Arial, sans-serif;
      text-transform: uppercase;
      letter-spacing: 0.16em;
      font-size: 9pt;
      color: #5b6b64;
      margin-top: 28px;
    }
    .hero-photo, .subject-hero {
      width: 100%;
      height: 280px;
      object-fit: cover;
      border-radius: 4px;
      background: #e8eee9;
      margin: 18px 0;
    }
    .photo-fallback {
      display: flex;
      align-items: center;
      justify-content: center;
      color: #6b7c74;
      font-family: "Avenir Next", "Segoe UI", Helvetica, Arial, sans-serif;
      font-size: 10pt;
      background: linear-gradient(135deg, #eef3f0, #dfe8e2);
    }
    .meta-block {
      font-family: "Avenir Next", "Segoe UI", Helvetica, Arial, sans-serif;
      font-size: 10.5pt;
      color: #24332d;
    }
    .meta-block strong { color: #14201C; }
    .fields {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px 16px;
      margin: 16px 0 20px;
    }
    .field {
      border-top: 1px solid #d5ddd8;
      padding-top: 6px;
    }
    .field span {
      display: block;
      font-family: "Avenir Next", "Segoe UI", Helvetica, Arial, sans-serif;
      font-size: 8pt;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #6b7c74;
    }
    .field strong { font-size: 11pt; }
    .metrics {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin: 14px 0 18px;
    }
    .metric {
      background: #f4f7f5;
      border-left: 3px solid ${esc(primary)};
      padding: 10px 12px;
    }
    .metric span {
      display: block;
      font-family: "Avenir Next", "Segoe UI", Helvetica, Arial, sans-serif;
      font-size: 8pt;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #5b6b64;
    }
    .metric strong { font-size: 12pt; }
    .rec-box {
      margin-top: 18px;
      padding: 14px 16px;
      border: 2px solid ${esc(primary)};
      border-radius: 4px;
      background: #f7fbf9;
    }
    .rec-box .label {
      font-family: "Avenir Next", "Segoe UI", Helvetica, Arial, sans-serif;
      font-size: 8.5pt;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: ${esc(primary)};
    }
    .rec-box .price {
      font-size: 22pt;
      color: ${esc(primary)};
      margin: 4px 0 8px;
    }
    .comp-card {
      display: grid;
      grid-template-columns: 140px 1fr;
      gap: 14px;
      margin: 0 0 16px;
      padding-bottom: 14px;
      border-bottom: 1px solid #d5ddd8;
    }
    .comp-photo {
      width: 140px;
      height: 105px;
      object-fit: cover;
      border-radius: 3px;
      background: #e8eee9;
    }
    .comp-body h3 { margin-bottom: 2px; }
    .comp-city, .comp-meta, .comp-match, .subtle {
      font-family: "Avenir Next", "Segoe UI", Helvetica, Arial, sans-serif;
      font-size: 9.5pt;
      color: #4a5a53;
    }
    .comp-price {
      font-size: 12pt;
      margin: 4px 0;
    }
    .comp-price span {
      font-family: "Avenir Next", "Segoe UI", Helvetica, Arial, sans-serif;
      font-size: 8pt;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #6b7c74;
      margin-right: 6px;
    }
    .badge, .outlier, .warn {
      font-family: "Avenir Next", "Segoe UI", Helvetica, Arial, sans-serif;
      font-size: 9pt;
    }
    .badge { color: ${esc(primary)}; font-weight: 650; }
    .outlier, .warn { color: #92400e; }
    .avoid-break { break-inside: avoid; page-break-inside: avoid; }
    table.comparison {
      width: 100%;
      border-collapse: collapse;
      font-family: "Avenir Next", "Segoe UI", Helvetica, Arial, sans-serif;
      font-size: 9pt;
      margin-top: 10px;
    }
    table.comparison th, table.comparison td {
      border: 1px solid #c9d3cd;
      padding: 6px 8px;
      text-align: left;
    }
    table.comparison th {
      background: ${esc(primary)};
      color: #fff;
    }
    .section-note {
      font-family: "Avenir Next", "Segoe UI", Helvetica, Arial, sans-serif;
      font-size: 9pt;
      color: #5b6b64;
      margin-bottom: 12px;
    }
    .final p {
      font-family: "Avenir Next", "Segoe UI", Helvetica, Arial, sans-serif;
      font-size: 9pt;
      color: #4a5a53;
    }
    .platform {
      margin-top: 28px;
      font-family: "Avenir Next", "Segoe UI", Helvetica, Arial, sans-serif;
      font-size: 8.5pt;
      color: #8a9690;
      text-align: center;
    }
    .footer-contact {
      margin-top: 18px;
      padding-top: 12px;
      border-top: 1px solid #d5ddd8;
    }
  </style>
</head>
<body>
  <section class="page cover">
    <div>
      <div class="brand-row">
        ${
          dto.brand.logoUrl
            ? `<img class="brand-logo" src="${esc(dto.brand.logoUrl)}" alt="${esc(dto.brand.displayName)}" />`
            : ""
        }
        <div class="brand-name">${esc(dto.brand.displayName)}</div>
      </div>
      <p class="eyebrow">Comparative Market Analysis</p>
      <h1>${esc(subjectFull)}</h1>
      ${photoBlock(dto.subject.photoUrl, subjectFull, "hero-photo")}
      <div class="meta-block">
        ${
          dto.preparedForName
            ? `<p><strong>Prepared for:</strong> ${esc(dto.preparedForName)}</p>`
            : ""
        }
        <p><strong>Prepared by:</strong> ${esc(dto.agent.name)}
          ${dto.agent.phone ? ` · ${esc(dto.agent.phone)}` : ""}
          ${dto.agent.email ? ` · ${esc(dto.agent.email)}` : ""}
        </p>
        <p><strong>Prepared date:</strong> ${esc(dto.preparedAt)}</p>
      </div>
    </div>
    <p class="platform">${esc(dto.platformCredit)}</p>
  </section>

  <section class="page">
    <h2>Subject property</h2>
    ${photoBlock(dto.subject.photoUrl, subjectFull, "subject-hero")}
    <h3>${esc(subjectFull)}</h3>
    <p class="section-note">${esc(dto.subject.propertyType)}${dto.subject.community ? ` · ${esc(dto.subject.community)}` : ""}${dto.subject.postalCode ? ` · ${esc(dto.subject.postalCode)}` : ""}</p>
    <div class="fields">
      ${dto.subject.fields
        .map(
          (f) =>
            `<div class="field"><span>${esc(f.label)}</span><strong>${esc(f.value)}</strong></div>`,
        )
        .join("")}
    </div>
    ${
      dto.recommendation.listPrice != null
        ? `<div class="rec-box avoid-break">
            <div class="label">Agent recommendation summary</div>
            <div class="price">${esc(money(dto.recommendation.listPrice))}</div>
            ${dto.recommendation.note ? `<p>${esc(dto.recommendation.note)}</p>` : ""}
          </div>`
        : `<p class="subtle">${esc(dto.recommendation.summary)}</p>`
    }
  </section>

  <section class="page">
    <h2>Market analysis</h2>
    <p class="section-note">Comparable evidence from saved selected sold comps. Active listings are shown separately and are not mixed into sold valuation evidence.</p>
    ${analysisMetrics}
    ${
      dto.recommendation.listPrice != null
        ? `<div class="rec-box avoid-break">
            <div class="label">Agent recommended list price</div>
            <div class="price">${esc(money(dto.recommendation.listPrice))}</div>
            <p class="subtle">${esc(dto.disclaimer)}</p>
          </div>`
        : `<p class="subtle">${esc(dto.disclaimer)}</p>`
    }
  </section>

  ${
    dto.soldComps.length
      ? `<section class="page">
    <h2>Sold comparables</h2>
    <p class="section-note">Selected sold evidence used for this CMA.</p>
    ${dto.soldComps.map((c) => compCard(c, "sold")).join("")}
  </section>`
      : ""
  }

  ${
    dto.competitionComps.length
      ? `<section class="page">
    <h2>Current market competition</h2>
    <p class="section-note">Active / conditional asking prices — not sold valuation evidence.</p>
    ${dto.competitionComps.map((c) => compCard(c, "active")).join("")}
  </section>`
      : ""
  }

  <section class="page">
    <h2>Comparison summary</h2>
    <p class="section-note">Subject vs selected sold comps (client-friendly fields for this property type).</p>
    ${
      dto.soldComps.length
        ? `<table class="comparison"><thead>${comparisonHead}</thead><tbody>${comparisonBody}</tbody></table>`
        : `<p class="subtle">No sold comps selected.</p>`
    }

    <div class="rec-box avoid-break" style="margin-top:24px">
      <div class="label">Agent recommendation</div>
      <div class="price">${esc(money(dto.recommendation.listPrice))}</div>
      ${dto.recommendation.note ? `<p>${esc(dto.recommendation.note)}</p>` : ""}
      ${
        dto.recommendation.narrative
          ? `<p>${esc(dto.recommendation.narrative)}</p>`
          : ""
      }
    </div>
  </section>

  <section class="page final">
    <h2>Important information</h2>
    <p><strong>${esc(dto.disclaimer)}</strong></p>
    <p>${esc(dto.mlsDisclaimer)}</p>
    <div class="footer-contact meta-block">
      <p><strong>${esc(dto.brand.displayName)}</strong></p>
      <p>${esc(dto.agent.name)}
        ${dto.agent.phone ? ` · ${esc(dto.agent.phone)}` : ""}
        ${dto.agent.email ? ` · ${esc(dto.agent.email)}` : ""}
      </p>
    </div>
    <p class="platform">${esc(dto.platformCredit)}</p>
  </section>
</body>
</html>`;
}
