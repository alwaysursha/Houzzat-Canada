import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAgentContextFromRequest } from "@/lib/agent";
import { createManualLead } from "@/lib/agent/create-manual-lead";
import {
  classifyImportedLead,
  LEAD_IMPORT_DEFAULT_TYPES,
  parseImportOptOut,
  parseImportPurchaseTimeframe,
} from "@/lib/agent/lead-import-classify";
import { deferredValue } from "@/lib/agent/lead-import-metadata";
import {
  findOpenImportLeadForEmail,
  resolveLeadImportOwnership,
} from "@/lib/agent/lead-import-ownership";
import {
  attachImportedLeadTags,
  createLeadImportJob,
  createLeadImportRow,
  extraUnmappedFromDeferred,
  finishLeadImportJob,
  persistImportedLeadOrigin,
  tagsRawFromDeferred,
  updateLeadImportRow,
} from "@/lib/agent/lead-import-persist";
import {
  LEADS_CSV_TEMPLATE,
  parseLeadsCsv,
  parseLeadsCsvTable,
  suggestLeadImportMapping,
  validateImportDraft,
} from "@/lib/agent/parse-leads-csv";
import { PURCHASE_TIMEFRAMES } from "@/lib/agent/timeframe";
import { detectClientWorkspaceOverride } from "@/lib/tenancy/public-lead-workspace";

export const runtime = "nodejs";

const MAX_ROWS = 500;

const deferredSchema = z.object({
  field: z.string().min(1).max(40),
  value: z.string().max(500),
  reason: z.string().max(200),
});

const leadRowSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(5000).optional(),
  homeAddress: z.string().trim().max(500).optional(),
  timeframeRaw: z.string().trim().max(80).optional(),
  purchaseTimeframe: z.enum(PURCHASE_TIMEFRAMES).optional(),
  utmSource: z.string().trim().max(200).optional(),
  leadTypeRaw: z.string().trim().max(80).optional(),
  optedOutRaw: z.string().trim().max(80).optional(),
  optedOut: z.boolean().optional(),
  deferred: z.array(deferredSchema).max(20).optional(),
  row: z.number().int().positive().optional(),
  original: z.record(z.string().max(120), z.string().max(5000)).optional(),
});

const bodySchema = z
  .object({
    /** Reviewed/edited rows from the import wizard (preferred). */
    leads: z.array(leadRowSchema).max(MAX_ROWS).optional(),
    /** Raw CSV fallback (legacy). */
    csv: z.string().min(1).max(2_000_000).optional(),
    allowDuplicates: z.boolean().optional(),
    defaultLeadType: z.enum(LEAD_IMPORT_DEFAULT_TYPES),
    assertCommunicationConsent: z.boolean().optional(),
    filename: z.string().trim().max(260).optional(),
    mapping: z
      .array(
        z.object({
          header: z.string().max(120),
          field: z.string().max(40),
        }),
      )
      .max(80)
      .optional(),
  })
  .refine((v) => Boolean(v.leads?.length || v.csv?.trim()), {
    message: "Provide leads[] or csv",
  });

export async function GET(request: Request) {
  const ctx = await requireAgentContextFromRequest(request);
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
  const ctx = await requireAgentContextFromRequest(request);
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  if (json && typeof json === "object" && !Array.isArray(json)) {
    const spoof = detectClientWorkspaceOverride(
      json as Record<string, unknown>,
    );
    if (spoof) {
      return NextResponse.json(
        { error: "Do not send workspace or tenant fields." },
        { status: 400 },
      );
    }
  }

  const ownership = resolveLeadImportOwnership(ctx);
  if (!ownership.ok) {
    return NextResponse.json(
      { error: ownership.error },
      { status: ownership.status },
    );
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Provide reviewed leads[] or a CSV string." },
      { status: 400 },
    );
  }

  const defaultLeadType = parsed.data.defaultLeadType;
  const assertCommunicationConsent =
    parsed.data.assertCommunicationConsent === true;

  type ImportRow = {
    name: string;
    email: string;
    phone?: string;
    notes?: string;
    homeAddress?: string;
    purchaseTimeframe?: (typeof PURCHASE_TIMEFRAMES)[number];
    utmSource?: string;
    leadTypeRaw?: string;
    optedOut: boolean;
    deferred: Array<{ field: string; value: string; reason: string }>;
    row: number;
    original: Record<string, string>;
  };

  let leads: ImportRow[] = [];
  let parseErrors: Array<{ row: number; error: string }> = [];
  let mappingJson: Array<{ header: string; field: string }> =
    parsed.data.mapping ?? [];

  if (parsed.data.leads?.length) {
    const seen = new Set<string>();
    parsed.data.leads.forEach((lead, index) => {
      const row = lead.row ?? index + 1;
      const classification = classifyImportedLead(
        defaultLeadType,
        lead.leadTypeRaw,
      );
      const issues = validateImportDraft(lead);
      if (!classification.ok) issues.push(classification.reason);
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
      const optedOut =
        lead.optedOut === true || parseImportOptOut(lead.optedOutRaw);
      const purchaseTimeframe =
        parseImportPurchaseTimeframe(lead.timeframeRaw) ??
        lead.purchaseTimeframe;
      const notes = lead.notes?.trim() || undefined;
      const deferred = lead.deferred ?? [];
      leads.push({
        name: lead.name.trim(),
        email,
        phone: lead.phone?.trim() || undefined,
        notes,
        homeAddress: lead.homeAddress?.trim() || undefined,
        purchaseTimeframe,
        utmSource: lead.utmSource?.trim() || undefined,
        leadTypeRaw: lead.leadTypeRaw?.trim() || undefined,
        optedOut,
        deferred,
        row,
        original: lead.original ?? {},
      });
    });
  } else if (parsed.data.csv) {
    const table = parseLeadsCsvTable(parsed.data.csv);
    if (mappingJson.length === 0) {
      mappingJson = suggestLeadImportMapping(table.headers);
    }
    const result = parseLeadsCsv(parsed.data.csv, defaultLeadType);
    parseErrors = result.errors;
    leads = result.leads.map((lead) => ({
      ...lead,
      original: table.rows[lead.row - 2] ?? {},
    }));
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

  const created: Array<{
    row: number;
    leadId: string;
    email: string;
    intent: string;
  }> = [];
  const skipped: Array<{ row: number; email: string; reason: string }> = [];
  const failed: Array<{ row: number; email: string; error: string }> = [];
  const deferredReports: Array<{
    row: number;
    email: string;
    field: string;
    value: string;
    reason: string;
  }> = [];

  const workspaceId = ownership.workspaceId;
  const job = workspaceId
    ? await createLeadImportJob({
        workspaceId,
        importedByUserId: ctx.user.id,
        filename: parsed.data.filename,
        mapping: mappingJson,
        defaultLeadType,
        consentAsserted: assertCommunicationConsent,
        allowDuplicates: parsed.data.allowDuplicates === true,
      })
    : null;

  const parseErrorsByRow = new Map<number, string[]>();
  for (const item of parseErrors) {
    const list = parseErrorsByRow.get(item.row) ?? [];
    list.push(item.error);
    parseErrorsByRow.set(item.row, list);
  }
  if (job && workspaceId) {
    for (const [rowNumber, errors] of parseErrorsByRow) {
      try {
        const importRow = await createLeadImportRow({
          workspaceId,
          jobId: job.id,
          rowNumber,
          payloadOriginal: {},
          payloadCanonical: { parseErrors: errors },
        });
        await updateLeadImportRow({
          id: importRow.id,
          status: "FAILED",
          error: errors.join("; "),
        });
      } catch {
        /* keep importing valid rows even if a parse-error row fails to persist */
      }
    }
  }

  let deferredFieldCount = 0;

  for (const row of leads) {
    const tagsRaw = tagsRawFromDeferred(row.deferred);
    const dateCreatedRaw = deferredValue(row.deferred, "date_created");
    const dealCompletedRaw = deferredValue(row.deferred, "deal_completed");
    const extraUnmapped = extraUnmappedFromDeferred(row.deferred);
    const importRow =
      job && workspaceId
        ? await createLeadImportRow({
            workspaceId,
            jobId: job.id,
            rowNumber: row.row,
            payloadOriginal: row.original,
            payloadCanonical: {
              name: row.name,
              email: row.email,
              phone: row.phone ?? null,
              notes: row.notes ?? null,
              homeAddress: row.homeAddress ?? null,
              purchaseTimeframe: row.purchaseTimeframe ?? null,
              utmSource: row.utmSource ?? null,
              leadTypeRaw: row.leadTypeRaw ?? null,
              optedOut: row.optedOut,
              consentAsserted: assertCommunicationConsent,
              tags: tagsRaw ?? null,
              dateCreated: dateCreatedRaw ?? null,
              dealCompleted: dealCompletedRaw ?? null,
            },
            email: row.email,
          })
        : null;

    try {
      const classification = classifyImportedLead(
        defaultLeadType,
        row.leadTypeRaw,
      );
      if (!classification.ok) {
        skipped.push({
          row: row.row,
          email: row.email,
          reason: classification.reason,
        });
        if (importRow) {
          await updateLeadImportRow({
            id: importRow.id,
            status: "SKIPPED",
            error: classification.reason,
          });
        }
        continue;
      }

      if (!parsed.data.allowDuplicates) {
        const existing = await findOpenImportLeadForEmail({
          email: row.email,
          workspaceId: ownership.workspaceId,
          organizationId: ownership.organizationId,
        });
        if (existing) {
          skipped.push({
            row: row.row,
            email: row.email,
            reason: "Open lead already exists",
          });
          if (importRow) {
            await updateLeadImportRow({
              id: importRow.id,
              status: "SKIPPED",
              leadId: existing.id,
              error: "Open lead already exists",
            });
          }
          if (
            workspaceId &&
            existing.workspaceId === workspaceId
          ) {
            await attachImportedLeadTags({
              workspaceId,
              leadId: existing.id,
              tagsRaw,
            });
          }
          continue;
        }
      }

      const result = await createManualLead({
        name: row.name,
        email: row.email,
        phone: row.phone,
        notes: row.notes,
        homeAddress: row.homeAddress,
        purchaseTimeframe: row.purchaseTimeframe,
        utmSource: row.utmSource,
        isBuyer: classification.isBuyer,
        isSeller: classification.isSeller,
        organizationId: ownership.organizationId,
        workspaceId: ownership.workspaceId,
        agentId: ctx.user.id,
        assertCommunicationConsent,
        optedOut: row.optedOut,
      });
      created.push({
        row: row.row,
        leadId: result.leadId,
        email: result.email,
        intent: result.intent,
      });
      if (importRow && workspaceId) {
        try {
          await updateLeadImportRow({
            id: importRow.id,
            status: "CREATED",
            leadId: result.leadId,
          });
          const origin = await persistImportedLeadOrigin({
            workspaceId,
            leadId: result.leadId,
            importRowId: importRow.id,
            defaultLeadType,
            leadTypeRaw: row.leadTypeRaw,
            dateCreatedRaw,
            dealCompletedRaw,
            extraUnmapped,
          });
          deferredFieldCount += origin.unmappedCount;
          if (origin.unmappedFields) {
            for (const [field, value] of Object.entries(origin.unmappedFields)) {
              deferredReports.push({
                row: row.row,
                email: row.email,
                field,
                value,
                reason:
                  "Recognized — stored on LeadOrigin.unmappedFields, not Notes.",
              });
            }
          }
          await attachImportedLeadTags({
            workspaceId,
            leadId: result.leadId,
            tagsRaw,
          });
        } catch (persistErr) {
          await updateLeadImportRow({
            id: importRow.id,
            status: "CREATED",
            leadId: result.leadId,
            error:
              persistErr instanceof Error
                ? persistErr.message
                : "Provenance persist failed",
          });
        }
      } else {
        for (const item of row.deferred) {
          deferredReports.push({
            row: row.row,
            email: row.email,
            field: item.field,
            value: item.value,
            reason: item.reason,
          });
        }
      }
    } catch (err) {
      failed.push({
        row: row.row,
        email: row.email,
        error: err instanceof Error ? err.message : "Create failed",
      });
      if (importRow) {
        await updateLeadImportRow({
          id: importRow.id,
          status: "FAILED",
          error: err instanceof Error ? err.message : "Create failed",
        });
      }
    }
  }

  if (job) {
    try {
      await finishLeadImportJob({
        jobId: job.id,
        createdCount: created.length,
        skippedCount: skipped.length,
        failedCount: failed.length + parseErrorsByRow.size,
        deferredFieldCount,
      });
    } catch {
      /* leads were already created; job totals can be repaired later */
    }
  }

  return NextResponse.json({
    ok: true,
    createdCount: created.length,
    skippedCount: skipped.length,
    failedCount: failed.length,
    parseErrorCount: parseErrors.length,
    deferredCount: deferredReports.length,
    created,
    skipped,
    failed,
    parseErrors,
    deferred: deferredReports.slice(0, 80),
  });
}
