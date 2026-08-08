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
  validateImportDraft,
} from "@/lib/agent/parse-leads-csv";

export const runtime = "nodejs";

const MAX_ROWS = 500;

const leadRowSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(5000).optional(),
  row: z.number().int().positive().optional(),
});

const bodySchema = z
  .object({
    /** Reviewed/edited rows from the import wizard (preferred). */
    leads: z.array(leadRowSchema).max(MAX_ROWS).optional(),
    /** Raw CSV fallback (legacy). */
    csv: z.string().min(1).max(2_000_000).optional(),
    allowDuplicates: z.boolean().optional(),
  })
  .refine((v) => Boolean(v.leads?.length || v.csv?.trim()), {
    message: "Provide leads[] or csv",
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
      { error: "Provide reviewed leads[] or a CSV string." },
      { status: 400 },
    );
  }

  let leads: Array<{
    name: string;
    email: string;
    phone?: string;
    notes?: string;
    row: number;
  }> = [];
  let parseErrors: Array<{ row: number; error: string }> = [];

  if (parsed.data.leads?.length) {
    const seen = new Set<string>();
    parsed.data.leads.forEach((lead, index) => {
      const row = lead.row ?? index + 1;
      const issues = validateImportDraft(lead);
      if (issues.length) {
        for (const error of issues) parseErrors.push({ row, error });
        return;
      }
      const email = lead.email.trim().toLowerCase();
      if (seen.has(email)) {
        parseErrors.push({ row, error: "Duplicate email in import" });
        return;
      }
      seen.add(email);
      leads.push({
        name: lead.name.trim(),
        email,
        phone: lead.phone?.trim() || undefined,
        notes: lead.notes?.trim() || undefined,
        row,
      });
    });
  } else if (parsed.data.csv) {
    const result = parseLeadsCsv(parsed.data.csv);
    leads = result.leads;
    parseErrors = result.errors;
  }

  if (leads.length === 0) {
    return NextResponse.json(
      {
        error:
          "No valid leads to import. Fix name/email on the review step and try again.",
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
