/**
 * Stage 5.12A — GET/PATCH /api/mobile/v2/cma/[id]
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import {
  assertLeadInWorkspace,
  authorizeMobileCmaWorkspace,
  canAccessCmaInWorkspace,
  findWorkspaceCma,
} from "@/lib/cma/access";
import { analyzeSelectedComps } from "@/lib/cma/engine";
import {
  CMA_JSON_VERSION,
  cmaSelectedCompSchema,
  parseCmaAnalysis,
  parseSelectedComps,
  parseSubjectSnapshot,
} from "@/lib/cma/schema";
import { SITE_URL } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const patchSchema = z.object({
  leadId: z.string().trim().min(1).max(128).nullable().optional(),
  selectedComps: z.array(cmaSelectedCompSchema).optional(),
  recommendedListPrice: z.number().int().positive().nullable().optional(),
  recommendationNote: z.string().max(4000).nullable().optional(),
  narrative: z.string().max(8000).nullable().optional(),
  revoke: z.boolean().optional(),
  restoreShare: z.boolean().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const access = await authorizeMobileCmaWorkspace(request);
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, code: access.code, message: access.message },
        { status: access.status },
      );
    }

    const report = await findWorkspaceCma({
      id,
      workspaceId: access.workspaceId,
    });
    if (
      !report ||
      !canAccessCmaInWorkspace({
        role: access.role,
        cmaAgentId: report.agentId,
        userId: access.userId,
      })
    ) {
      return NextResponse.json(
        { ok: false, code: "NOT_FOUND", message: "CMA not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        id: report.id,
        token: report.token,
        shareUrl: `${SITE_URL}/cma/${report.token}`,
        revoked: Boolean(report.revokedAt),
        subjectAddress: report.subjectAddress,
        subjectMls: report.subjectMls ?? report.listingMls,
        city: report.city,
        community: report.community,
        summary: report.summary,
        leadId: report.leadId,
        recommendedListPrice: report.recommendedListPrice,
        recommendationNote: report.recommendationNote,
        narrative: report.narrative,
        subjectSnapshot: parseSubjectSnapshot(report.subjectSnapshot),
        selectedComps: parseSelectedComps(report.selectedComps),
        analysis: parseCmaAnalysis(report.analysis),
        createdAt: report.createdAt.toISOString(),
        updatedAt: report.updatedAt.toISOString(),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", message },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const access = await authorizeMobileCmaWorkspace(request);
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, code: access.code, message: access.message },
        { status: access.status },
      );
    }

    const report = await findWorkspaceCma({
      id,
      workspaceId: access.workspaceId,
    });
    if (
      !report ||
      !canAccessCmaInWorkspace({
        role: access.role,
        cmaAgentId: report.agentId,
        userId: access.userId,
      })
    ) {
      return NextResponse.json(
        { ok: false, code: "NOT_FOUND", message: "CMA not found" },
        { status: 404 },
      );
    }

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Invalid JSON" },
        { status: 400 },
      );
    }

    if (!json || typeof json !== "object" || Array.isArray(json)) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Invalid body" },
        { status: 400 },
      );
    }
    const allowed = new Set([
      "leadId",
      "selectedComps",
      "recommendedListPrice",
      "recommendationNote",
      "narrative",
      "revoke",
      "restoreShare",
    ]);
    if (Object.keys(json as object).some((k) => !allowed.has(k))) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Unknown fields" },
        { status: 400 },
      );
    }

    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Invalid patch" },
        { status: 400 },
      );
    }

    if (parsed.data.leadId) {
      const leadOk = await assertLeadInWorkspace({
        leadId: parsed.data.leadId,
        workspaceId: access.workspaceId,
        userId: access.userId,
        role: access.role,
      });
      if (!leadOk.ok) {
        return NextResponse.json(
          { ok: false, code: leadOk.code, message: leadOk.message },
          { status: leadOk.status },
        );
      }
    }

    const data: Prisma.CmaReportUpdateInput = {};

    if (parsed.data.leadId !== undefined) {
      data.lead =
        parsed.data.leadId === null
          ? { disconnect: true }
          : { connect: { id: parsed.data.leadId } };
    }
    if (parsed.data.recommendedListPrice !== undefined) {
      data.recommendedListPrice = parsed.data.recommendedListPrice;
    }
    if (parsed.data.recommendationNote !== undefined) {
      data.recommendationNote = parsed.data.recommendationNote;
    }
    if (parsed.data.narrative !== undefined) {
      data.narrative = parsed.data.narrative;
    }
    if (parsed.data.revoke === true) {
      data.revokedAt = new Date();
    }
    if (parsed.data.restoreShare === true) {
      data.revokedAt = null;
    }

    if (parsed.data.selectedComps) {
      const analysis = analyzeSelectedComps(parsed.data.selectedComps);
      data.selectedComps = {
        version: CMA_JSON_VERSION,
        items: parsed.data.selectedComps,
      } as unknown as Prisma.InputJsonValue;
      data.analysis = analysis as unknown as Prisma.InputJsonValue;
      data.comps = parsed.data.selectedComps.map((c) => ({
        mlsNumber: c.mlsNumber,
        addressLine: c.property.addressLine,
        unitNumber: c.property.unitNumber,
        city: c.property.city,
        community: c.property.community,
        status: c.property.status,
        listPrice: c.property.listPrice,
        soldPrice: c.property.soldPrice,
        beds: c.property.beds,
        bedsLabel: null,
        baths: c.property.baths,
        sqft: c.property.sqft,
        distanceKm: c.distanceKm,
        daysOnMarket: c.property.daysOnMarket,
        soldAt: c.property.soldAt,
      })) as Prisma.InputJsonValue;
      data.summary = [
        analysis.limitedInventory
          ? "LIMITED COMPARABLE INVENTORY."
          : `Based on ${analysis.soldCompCount} sold comps`,
        analysis.medianSoldPrice != null
          ? `median sold ~$${analysis.medianSoldPrice.toLocaleString()}`
          : null,
        "Draft for agent review only — not a formal appraisal.",
      ]
        .filter(Boolean)
        .join(". ");
    }

    const updated = await prisma.cmaReport.update({
      where: { id: report.id },
      data,
    });

    return NextResponse.json({
      ok: true,
      data: {
        id: updated.id,
        token: updated.token,
        shareUrl: `${SITE_URL}/cma/${updated.token}`,
        revoked: Boolean(updated.revokedAt),
        summary: updated.summary,
        recommendedListPrice: updated.recommendedListPrice,
        recommendationNote: updated.recommendationNote,
        narrative: updated.narrative,
        leadId: updated.leadId,
        selectedComps: parseSelectedComps(updated.selectedComps),
        analysis: parseCmaAnalysis(updated.analysis),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", message },
      { status: 500 },
    );
  }
}
