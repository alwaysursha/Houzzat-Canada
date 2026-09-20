import type { PrismaClient } from "@prisma/client";
import { writePlatformAuditEvent } from "@/lib/platform/audit";
import {
  SMS_QUICK_TEXT_CATALOG,
  SMS_QUICK_TEXT_AUDIT,
  SMS_QUICK_TEXT_ENTITY_TYPE,
  SMS_QUICK_TEXT_PROTECTION_COPY,
  SMS_QUICK_TEXT_VARIABLES,
  previewSmsQuickText,
  validateSmsQuickTextBody,
} from "@/lib/sms/quick-texts";
import { SmsQuickTextActionError } from "./errors";

export type SmsQuickTextRow = {
  id: string;
  key: string;
  name: string;
  category: string;
  body: string;
  sortOrder: number;
  active: boolean;
  allowedVariables: string[];
  createdAt: Date;
  updatedAt: Date;
  createdByOperatorId: string | null;
  updatedByOperatorId: string | null;
};

export type SmsQuickTextDb = {
  smsQuickText: {
    findUnique: (args: {
      where: { id: string } | { key: string };
    }) => Promise<SmsQuickTextRow | null>;
    findMany: (args?: object) => Promise<SmsQuickTextRow[]>;
    create: (args: {
      data: Omit<SmsQuickTextRow, "id" | "createdAt" | "updatedAt"> & {
        id?: string;
      };
    }) => Promise<SmsQuickTextRow>;
    update: (args: {
      where: { id: string };
      data: Partial<SmsQuickTextRow>;
    }) => Promise<SmsQuickTextRow>;
  };
};

export type SmsQuickTextAuditWriter = typeof writePlatformAuditEvent;

function slugKey(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return slug || `quick_text_${Date.now()}`;
}

export async function ensureSmsQuickTextCatalog(
  db: SmsQuickTextDb,
  audit: SmsQuickTextAuditWriter | null = null,
): Promise<{ createdKeys: string[] }> {
  const createdKeys: string[] = [];
  for (const spec of SMS_QUICK_TEXT_CATALOG) {
    const existing = await db.smsQuickText.findUnique({
      where: { key: spec.key },
    });
    if (existing) continue;
    const row = await db.smsQuickText.create({
      data: {
        key: spec.key,
        name: spec.name,
        category: spec.category,
        body: spec.body,
        sortOrder: spec.sortOrder,
        active: true,
        allowedVariables: [...spec.allowedVariables],
        createdByOperatorId: null,
        updatedByOperatorId: null,
      },
    });
    createdKeys.push(spec.key);
    if (audit) {
      await audit({
        actorType: "SYSTEM",
        action: SMS_QUICK_TEXT_AUDIT.seeded,
        entityType: SMS_QUICK_TEXT_ENTITY_TYPE,
        entityId: row.id,
        summary: `Seeded Quick Text ${spec.key}`,
        metadata: { key: spec.key },
      });
    }
  }
  return { createdKeys };
}

function assertValidBody(body: string, allowed: readonly string[]) {
  const validation = validateSmsQuickTextBody(body, allowed);
  if (!validation.ok) {
    throw new SmsQuickTextActionError(
      "Template has an empty body or invalid variables.",
      "INVALID_VARIABLES",
    );
  }
}

export async function createSmsQuickText(input: {
  db: SmsQuickTextDb;
  operatorId: string;
  name: string;
  category: string;
  body: string;
  allowedVariables?: string[];
  active?: boolean;
  audit?: SmsQuickTextAuditWriter;
}): Promise<SmsQuickTextRow> {
  const name = input.name.trim();
  const category = input.category.trim() || name;
  const body = input.body.replace(/\r\n/g, "\n").trim();
  if (!name) {
    throw new SmsQuickTextActionError("Name is required.", "NAME_REQUIRED");
  }
  const allowed =
    input.allowedVariables?.length
      ? input.allowedVariables
      : [...SMS_QUICK_TEXT_VARIABLES];
  assertValidBody(body, allowed);
  let key = slugKey(name);
  const clash = await input.db.smsQuickText.findUnique({ where: { key } });
  if (clash) key = `${key}_${Date.now().toString(36)}`;
  const existing = await input.db.smsQuickText.findMany();
  const sortOrder =
    existing.reduce((max, row) => Math.max(max, row.sortOrder), 0) + 10;
  const row = await input.db.smsQuickText.create({
    data: {
      key,
      name,
      category,
      body,
      sortOrder,
      active: input.active !== false,
      allowedVariables: [...allowed],
      createdByOperatorId: input.operatorId,
      updatedByOperatorId: input.operatorId,
    },
  });
  if (input.audit) {
    await input.audit({
      actorOperatorId: input.operatorId,
      actorType: "OPERATOR",
      action: SMS_QUICK_TEXT_AUDIT.created,
      entityType: SMS_QUICK_TEXT_ENTITY_TYPE,
      entityId: row.id,
      summary: `Created Quick Text ${row.key}`,
      metadata: { key: row.key },
    });
  }
  return row;
}

export async function updateSmsQuickText(input: {
  db: SmsQuickTextDb;
  operatorId: string;
  id: string;
  name?: string;
  category?: string;
  body?: string;
  active?: boolean;
  allowedVariables?: string[];
  audit?: SmsQuickTextAuditWriter;
}): Promise<SmsQuickTextRow> {
  const existing = await input.db.smsQuickText.findUnique({
    where: { id: input.id },
  });
  if (!existing) {
    throw new SmsQuickTextActionError(
      "Quick Text not found.",
      "NOT_FOUND",
      404,
    );
  }
  const allowed = input.allowedVariables ?? existing.allowedVariables;
  const body =
    input.body != null ? input.body.replace(/\r\n/g, "\n").trim() : existing.body;
  if (input.body != null) assertValidBody(body, allowed);
  const nextActive =
    typeof input.active === "boolean" ? input.active : existing.active;
  const row = await input.db.smsQuickText.update({
    where: { id: existing.id },
    data: {
      name: input.name?.trim() || existing.name,
      category: input.category?.trim() || existing.category,
      body,
      allowedVariables: [...allowed],
      active: nextActive,
      updatedByOperatorId: input.operatorId,
    },
  });
  if (input.audit) {
    let action: string = SMS_QUICK_TEXT_AUDIT.updated;
    if (existing.active !== nextActive) {
      action = nextActive
        ? SMS_QUICK_TEXT_AUDIT.activated
        : SMS_QUICK_TEXT_AUDIT.deactivated;
    }
    await input.audit({
      actorOperatorId: input.operatorId,
      actorType: "OPERATOR",
      action,
      entityType: SMS_QUICK_TEXT_ENTITY_TYPE,
      entityId: row.id,
      summary: `Updated Quick Text ${row.key}`,
      metadata: { key: row.key, active: row.active },
    });
  }
  return row;
}

export async function reorderSmsQuickTexts(input: {
  db: SmsQuickTextDb;
  operatorId: string;
  ids: string[];
  audit?: SmsQuickTextAuditWriter;
}): Promise<SmsQuickTextRow[]> {
  const rows = await input.db.smsQuickText.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  if (!input.ids.length) {
    throw new SmsQuickTextActionError("ids are required.", "IDS_REQUIRED");
  }
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const id of input.ids) {
    if (!byId.has(id)) {
      throw new SmsQuickTextActionError(
        "Unknown Quick Text in reorder list.",
        "NOT_FOUND",
        404,
      );
    }
  }
  let order = 10;
  const updated: SmsQuickTextRow[] = [];
  for (const id of input.ids) {
    updated.push(
      await input.db.smsQuickText.update({
        where: { id },
        data: { sortOrder: order, updatedByOperatorId: input.operatorId },
      }),
    );
    order += 10;
  }
  if (input.audit) {
    await input.audit({
      actorOperatorId: input.operatorId,
      actorType: "OPERATOR",
      action: SMS_QUICK_TEXT_AUDIT.reordered,
      entityType: SMS_QUICK_TEXT_ENTITY_TYPE,
      entityId: input.ids[0] ?? "sms-quick-texts",
      summary: "Reordered Quick Texts",
      metadata: { count: input.ids.length },
    });
  }
  return updated;
}

export { previewSmsQuickText, SMS_QUICK_TEXT_PROTECTION_COPY };

export {
  firstNameFromLeadName,
  renderSmsQuickText,
} from "@/lib/sms/quick-texts";

export function serializeSmsQuickText(row: SmsQuickTextRow) {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    category: row.category,
    body: row.body,
    sortOrder: row.sortOrder,
    active: row.active,
    allowedVariables: row.allowedVariables,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdByOperatorId: row.createdByOperatorId,
    updatedByOperatorId: row.updatedByOperatorId,
  };
}

export async function listSmsQuickTexts(db: SmsQuickTextDb) {
  await ensureSmsQuickTextCatalog(db);
  const items = await db.smsQuickText.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return {
    protectionCopy: SMS_QUICK_TEXT_PROTECTION_COPY,
    allowedVariables: [...SMS_QUICK_TEXT_VARIABLES],
    items: items.map(serializeSmsQuickText),
  };
}

export async function getSmsQuickText(db: SmsQuickTextDb, id: string) {
  await ensureSmsQuickTextCatalog(db);
  const row = await db.smsQuickText.findUnique({ where: { id } });
  if (!row) return null;
  return {
    protectionCopy: SMS_QUICK_TEXT_PROTECTION_COPY,
    allowedVariables: [...SMS_QUICK_TEXT_VARIABLES],
    item: serializeSmsQuickText(row),
  };
}

export async function listActiveSmsQuickTexts(db: SmsQuickTextDb) {
  await ensureSmsQuickTextCatalog(db);
  const items = await db.smsQuickText.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return items.filter((row) => row.active);
}

export function prismaSmsQuickTextDb(prisma: PrismaClient): SmsQuickTextDb {
  return prisma as unknown as SmsQuickTextDb;
}

export { SmsQuickTextActionError } from "./errors";
