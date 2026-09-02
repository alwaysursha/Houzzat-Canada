/**
 * Stage 5.12A — POST /api/mobile/v2/cma/[id]/find-comps
 * Re-run advanced engine and replace AUTO comps (keeps AGENT comps).
 */

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import {
  authorizeMobileCmaWorkspace,
  canAccessCmaInWorkspace,
  findWorkspaceCma,
} from "@/lib/cma/access";
import { findAdvancedComps } from "@/lib/cma/engine";
import {
  CMA_JSON_VERSION,
  parseSelectedComps,
} from "@/lib/cma/schema";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
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

    const subjectMls = report.subjectMls ?? report.listingMls;
    if (!subjectMls) {
      return NextResponse.json(
        {
          ok: false,
          code: "VALIDATION_ERROR",
          message: "CMA has no subject MLS",
        },
        { status: 400 },
      );
    }

    const existing = parseSelectedComps(report.selectedComps);
    const agentKept = existing?.items.filter((c) => c.source === "AGENT") ?? [];
    const exclude = agentKept.map((c) => c.mlsNumber);

    const found = await findAdvancedComps({
      subjectMls,
      excludeMls: exclude,
    });
    if ("error" in found) {
      return NextResponse.json(
        { ok: false, code: "NOT_FOUND", message: found.error },
        { status: 404 },
      );
    }

    const merged = [
      ...found.selectedComps.filter(
        (c) => !exclude.includes(c.mlsNumber),
      ),
      ...agentKept,
    ];

    const updated = await prisma.cmaReport.update({
      where: { id: report.id },
      data: {
        subjectSnapshot: found.subject as unknown as Prisma.InputJsonValue,
        selectedComps: {
          version: CMA_JSON_VERSION,
          items: merged,
        } as unknown as Prisma.InputJsonValue,
        analysis: found.analysis as unknown as Prisma.InputJsonValue,
        summary: found.summary,
        comps: merged.map((c) => ({
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
        })) as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        id: updated.id,
        selectedComps: merged,
        analysis: found.analysis,
        summary: found.summary,
        candidateCount: found.candidateCount,
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
