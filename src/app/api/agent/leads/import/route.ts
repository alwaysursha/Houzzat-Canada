import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAgentContext } from "@/lib/agent";
import {
  createManualLead,
  findOpenOrgLeadForEmail,
} from "@/lib/agent/create-manual-lead";
import {
  LEADS_CSV_TEMPLATE,
  parseLeadsCsv,
} from "@/lib/agent/parse-leads-csv";

export const runtime = "nodejs";

const MAX_ROWS = 500;

const bodySchema = z.object({
  csv: z.string().min(1).max(2_000_000),
  /** When true, create even if an open lead already exists for that email. */
  allowDuplicates: z.boolean().optional(),
});

export async function GET() {
  const ctx = await requireAgentContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return new NextResponse(LEADS_CSV_TEMPLATE, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="houzzat-leads-template.csv"',
    },
  });
}

export async function POST(request: Request) {
  const ctx = await requireAgentContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Provide a CSV string in { csv }." },
      { status: 400 },
    );
  }

  const { leads, errors: parseErrors } = parseLeadsCsv(parsed.data.csv);
  if (leads.length === 0) {
    return NextResponse.json(
      {
        error: "No valid leads found. Need columns: name, email (phone/notes optional).",
        parseErrors,
      },
      { status: 400 },
    );
  }
  if (leads.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `Too many rows (max ${MAX_ROWS}).` },
      { status: 400 },
    );
  }

  const created: Array<{ row: number; leadId: string; email: string }> = [];
  const skipped: Array<{ row: number; email: string; reason: string }> = [];
  const failed: Array<{ row: number; email: string; error: string }> = [];

  for (const row of leads) {
    try {
      if (!parsed.data.allowDuplicates) {
        const existing = await findOpenOrgLeadForEmail(
          ctx.organizationId,
          row.email,
        );
        if (existing) {
          skipped.push({
            row: row.row,
            email: row.email,
            reason: "Open lead already exists",
          });
          continue;
        }
      }

      const result = await createManualLead({
        name: row.name,
        email: row.email,
        phone: row.phone,
        notes: row.notes,
        organizationId: ctx.organizationId,
        agentId: ctx.user.id,
        activityBody: "Lead imported from CSV",
      });
      created.push({
        row: row.row,
        leadId: result.leadId,
        email: result.email,
      });
    } catch (err) {
      failed.push({
        row: row.row,
        email: row.email,
        error: err instanceof Error ? err.message : "Create failed",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    createdCount: created.length,
    skippedCount: skipped.length,
    failedCount: failed.length,
    parseErrorCount: parseErrors.length,
    created,
    skipped,
    failed,
    parseErrors,
  });
}
