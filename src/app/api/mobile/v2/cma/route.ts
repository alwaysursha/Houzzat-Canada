/**
 * Stage 5.12A — Mobile v2 CMA list + create
 * GET/POST /api/mobile/v2/cma
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import {
  assertLeadInWorkspace,
  authorizeMobileCmaWorkspace,
} from "@/lib/cma/access";
import { findAdvancedComps } from "@/lib/cma/engine";
import { CMA_JSON_VERSION } from "@/lib/cma/schema";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const createSchema = z.object({
  subjectMls: z.string().trim().min(1).max(64),
  leadId: z.string().trim().min(1).max(128).optional(),
});

export async function GET(request: Request) {
  try {
    const access = await authorizeMobileCmaWorkspace(request);
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, code: access.code, message: access.message },
        { status: access.status },
      );
    }

    const rows = await prisma.cmaReport.findMany({
      where: {
        workspaceId: access.workspaceId,
        ...(access.role === "AGENT" ? { agentId: access.userId } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        token: true,
        subjectAddress: true,
        subjectMls: true,
        listingMls: true,
        city: true,
        community: true,
        summary: true,
        recommendedListPrice: true,
        leadId: true,
        createdAt: true,
        updatedAt: true,
        revokedAt: true,
        analysis: true,
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        items: rows.map((r) => ({
          id: r.id,
          token: r.token,
          subjectAddress: r.subjectAddress,
          subjectMls: r.subjectMls ?? r.listingMls,
          city: r.city,
          community: r.community,
          summary: r.summary,
          recommendedListPrice: r.recommendedListPrice,
          leadId: r.leadId,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
          revoked: Boolean(r.revokedAt),
          confidence:
            r.analysis &&
            typeof r.analysis === "object" &&
            "confidence" in (r.analysis as object)
              ? (r.analysis as { confidence?: string }).confidence ?? null
              : null,
        })),
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

export async function POST(request: Request) {
  try {
    const access = await authorizeMobileCmaWorkspace(request);
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, code: access.code, message: access.message },
        { status: access.status },
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
    const keys = Object.keys(json as object);
    const allowed = new Set(["subjectMls", "leadId"]);
    if (keys.some((k) => !allowed.has(k))) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Unknown fields" },
        { status: 400 },
      );
    }
    if ("workspaceId" in (json as object) || "userId" in (json as object)) {
      return NextResponse.json(
        {
          ok: false,
          code: "VALIDATION_ERROR",
          message: "workspaceId/userId not accepted",
        },
        { status: 400 },
      );
    }

    const parsed = createSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Invalid CMA input" },
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

    const found = await findAdvancedComps({
      subjectMls: parsed.data.subjectMls,
    });
    if ("error" in found) {
      return NextResponse.json(
        { ok: false, code: "NOT_FOUND", message: found.error },
        { status: 404 },
      );
    }

    const report = await prisma.cmaReport.create({
      data: {
        workspaceId: access.workspaceId,
        agentId: access.userId,
        leadId: parsed.data.leadId ?? null,
        listingMls: found.subject.mlsNumber,
        subjectMls: found.subject.mlsNumber,
        subjectAddress: found.subject.addressLine,
        city: found.subject.city,
        community: found.subject.community,
        beds: found.subject.beds,
        baths: found.subject.baths,
        lat: found.subject.lat,
        lng: found.subject.lng,
        summary: found.summary,
        // Legacy comps array (backward compatible public page)
        comps: found.selectedComps.map((c) => ({
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
        subjectSnapshot: found.subject as unknown as Prisma.InputJsonValue,
        selectedComps: {
          version: CMA_JSON_VERSION,
          items: found.selectedComps,
        } as unknown as Prisma.InputJsonValue,
        analysis: found.analysis as unknown as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        id: report.id,
        token: report.token,
        summary: report.summary,
        subject: found.subject,
        selectedComps: found.selectedComps,
        analysis: found.analysis,
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
