/**
 * Stage 5.12B — CMA PDF generation from saved CmaReport state.
 *
 * Uses Cloudflare Browser Rendering (binding preferred, REST fallback).
 * No Chromium binary, no Prisma PDF persistence.
 */

import {
  browserRenderingConfigStatus,
  isBrowserRenderingConfigured,
  renderHtmlToPdf,
} from "@/lib/cma/browser-rendering-pdf";
import { sanitizeCmaPdfFilename } from "@/lib/cma/filename";
import {
  buildCmaPresentationDto,
  hasSavedCmaPresentationEvidence,
} from "@/lib/cma/presentation";
import { renderCmaPrintHtml } from "@/lib/cma/print-html";
import { SITE_URL } from "@/lib/constants";
import { listingPhotoSrc } from "@/lib/listings/photo-src";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceBrand } from "@/lib/tenancy/resolve-workspace-brand";

export const CMA_PDF_STATUS = {
  get available() {
    return isBrowserRenderingConfigured();
  },
  get reason() {
    return browserRenderingConfigStatus().reason;
  },
  get mode() {
    return browserRenderingConfigStatus().mode;
  },
};

export type GenerateCmaPdfOk = {
  ok: true;
  bytes: Uint8Array;
  filename: string;
  contentType: "application/pdf";
  via: "binding" | "rest" | "mock";
};

export type GenerateCmaPdfErr = {
  ok: false;
  status: number;
  code: string;
  message: string;
};

async function loadSubjectPhotoUrl(
  mls: string | null | undefined,
): Promise<string | null> {
  if (!mls?.trim()) return null;
  try {
    const listing = await prisma.listing.findFirst({
      where: { mlsNumber: mls.trim() },
      select: {
        media: {
          orderBy: { sortOrder: "asc" },
          take: 1,
          select: { url: true },
        },
      },
    });
    const raw = listing?.media[0]?.url ?? null;
    return listingPhotoSrc(raw) ?? raw;
  } catch (err) {
    console.error(
      "[cma-pdf] subject photo lookup failed",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Generate PDF for an authenticated agent CMA (workspace-scoped caller).
 * Uses saved snapshots only — never find-comps / scoring.
 */
export async function generateCmaPdfForReport(input: {
  reportId: string;
  workspaceId: string;
}): Promise<GenerateCmaPdfOk | GenerateCmaPdfErr> {
  if (!isBrowserRenderingConfigured()) {
    return {
      ok: false,
      status: 503,
      code: "PDF_UNAVAILABLE",
      message:
        "PDF generation is not configured. Browser Rendering credentials or binding required.",
    };
  }

  const report = await prisma.cmaReport.findFirst({
    where: {
      id: input.reportId,
      workspaceId: input.workspaceId,
    },
    include: {
      agent: {
        select: {
          name: true,
          email: true,
          agentProfile: { select: { phone: true } },
        },
      },
      lead: {
        select: {
          customer: { select: { name: true } },
        },
      },
    },
  });

  if (!report || !report.workspaceId) {
    return {
      ok: false,
      status: 404,
      code: "NOT_FOUND",
      message: "CMA not found",
    };
  }

  if (!hasSavedCmaPresentationEvidence(report)) {
    return {
      ok: false,
      status: 422,
      code: "SNAPSHOT_INCOMPLETE",
      message:
        "Saved CMA snapshots are incomplete. Find comps and save before generating PDF.",
    };
  }

  const brand = await resolveWorkspaceBrand(report.workspaceId);
  const subjectPhotoUrl = await loadSubjectPhotoUrl(
    report.subjectMls ?? report.listingMls,
  );

  const dto = buildCmaPresentationDto({
    report,
    brand,
    agent: {
      name: report.agent.name,
      email: report.agent.email,
      phone: report.agent.agentProfile?.phone ?? null,
    },
    preparedForName: report.lead?.customer?.name ?? null,
    subjectPhotoUrl,
    siteOrigin: SITE_URL,
  });

  const html = renderCmaPrintHtml(dto);
  const rendered = await renderHtmlToPdf(html);
  if (!rendered.ok) {
    return {
      ok: false,
      status: 502,
      code: rendered.code,
      message: rendered.message,
    };
  }

  const filename = sanitizeCmaPdfFilename({
    addressLine: dto.subject.addressLine,
    preparedDate: report.createdAt,
  });

  return {
    ok: true,
    bytes: rendered.bytes,
    filename,
    contentType: "application/pdf",
    via: rendered.via,
  };
}
