import type { Prisma, PrismaClient, WorkspaceEmailDomainStatus } from "@prisma/client";
import {
  CUSTOM_SENDING_CONSTRAINTS,
  CustomSendingError,
  enabledCustomFromHeader,
  formatCustomFromHeader,
  prepareSendingDomain,
  type CustomSendingDnsRecord,
  type CustomSendingRequest,
} from "@/lib/email/custom-sending-policy";
import { isResendConfigured } from "@/lib/email/config";
import { emailEnv } from "@/lib/email/env";
import {
  createResendDomainClient,
  findListedDomain,
  parseResendDomain,
  type ResendDomainClient,
  type ResendDomainSnapshot,
} from "@/lib/email/resend-domains";
import { sendRenderedEmail } from "@/lib/email/send";
import { writePlatformAuditEvent } from "@/lib/platform/audit";
import { prisma as defaultPrisma } from "@/lib/prisma";

export type CustomSendingView = {
  sendingDomain: string | null;
  returnPathHost: string | null;
  senderDisplayName: string | null;
  fromEmail: string | null;
  replyToEmail: string | null;
  domainStatus: WorkspaceEmailDomainStatus;
  customSendingEnabled: boolean;
  records: CustomSendingDnsRecord[];
  constraints: readonly string[];
  providerConfigured: boolean;
  activeFrom: string | null;
};

type IdentityRecord = {
  workspaceId: string;
  senderDisplayName: string | null;
  replyToEmail: string | null;
  customDomain: string | null;
  fromEmail: string | null;
  returnPathLabel: string | null;
  providerDomainId: string | null;
  customSendingEnabled: boolean;
  domainStatus: WorkspaceEmailDomainStatus;
  dnsRecordsJson: Prisma.JsonValue | null;
};

function recordsFromJson(value: Prisma.JsonValue | null): CustomSendingDnsRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    if (
      typeof record.type !== "string" ||
      typeof record.host !== "string" ||
      typeof record.value !== "string"
    ) {
      return [];
    }
    return [
      {
        type: record.type,
        host: record.host,
        value: record.value,
        priority: typeof record.priority === "number" ? record.priority : null,
        purpose: typeof record.purpose === "string" ? record.purpose : record.type,
      },
    ];
  });
}

function toView(identity: IdentityRecord | null, providerConfigured: boolean): CustomSendingView {
  const returnPathHost =
    identity?.customDomain && identity.returnPathLabel
      ? `${identity.returnPathLabel}.${identity.customDomain}`
      : null;
  return {
    sendingDomain: identity?.customDomain ?? null,
    returnPathHost,
    senderDisplayName: identity?.senderDisplayName ?? null,
    fromEmail: identity?.fromEmail ?? null,
    replyToEmail: identity?.replyToEmail ?? null,
    domainStatus: identity?.domainStatus ?? "NONE",
    customSendingEnabled: identity?.customSendingEnabled ?? false,
    records: recordsFromJson(identity?.dnsRecordsJson ?? null),
    constraints: CUSTOM_SENDING_CONSTRAINTS,
    providerConfigured,
    activeFrom: enabledCustomFromHeader(identity),
  };
}

function providerStatus(status: string): WorkspaceEmailDomainStatus {
  switch (status) {
    case "verified":
      return "VERIFIED";
    case "failed":
    case "temporary_failure":
      return "FAILED";
    case "not_started":
    case "pending":
    case "partially_verified":
      return "PENDING";
    default:
      return "PENDING";
  }
}

function requireApi(client: ResendDomainClient | null): ResendDomainClient {
  if (client) return client;
  if (!isResendConfigured()) {
    throw new CustomSendingError(
      "The email provider is not configured, so the domain was not registered.",
      "RESEND_NOT_CONFIGURED",
      503,
    );
  }
  return createResendDomainClient(emailEnv("RESEND_API_KEY") ?? "");
}

async function loadIdentity(db: PrismaClient, workspaceId: string) {
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true },
  });
  if (!workspace) {
    throw new CustomSendingError("Workspace not found.", "WORKSPACE_NOT_FOUND", 404);
  }
  return db.workspaceEmailIdentity.findUnique({ where: { workspaceId } });
}

async function readSnapshot(
  client: ResendDomainClient,
  domainId: string,
  domainName: string,
): Promise<ResendDomainSnapshot> {
  const response = await client.get(domainId);
  const parsed = parseResendDomain(response.body, domainName);
  if (response.status === 200 && parsed) return parsed;
  throw new CustomSendingError(
    `The email provider domain check returned HTTP ${response.status}.`,
    "RESEND_API_ERROR",
    502,
  );
}

async function registerDomain(
  client: ResendDomainClient,
  input: { name: string; returnPathLabel: string },
): Promise<ResendDomainSnapshot> {
  const created = await client.create(input);
  const parsed = parseResendDomain(created.body, input.name);
  if ((created.status === 200 || created.status === 201) && parsed) return parsed;
  if (created.status === 409) {
    const listed = await client.list();
    const existing = findListedDomain(listed.body, input.name);
    if (listed.status === 200 && existing) {
      return readSnapshot(client, existing.id, input.name);
    }
  }
  throw new CustomSendingError(
    `The email provider could not register the domain (HTTP ${created.status}).`,
    "RESEND_API_ERROR",
    502,
  );
}

export async function inspectCustomSending(input: {
  prisma?: PrismaClient;
  workspaceId: string;
}): Promise<CustomSendingView> {
  const db = input.prisma ?? defaultPrisma;
  const identity = await loadIdentity(db, input.workspaceId);
  return toView(identity, isResendConfigured());
}

export async function prepareCustomSending(input: {
  prisma?: PrismaClient;
  operatorId: string;
  workspaceId: string;
  request: CustomSendingRequest;
  resend?: ResendDomainClient | null;
}): Promise<CustomSendingView> {
  const prepared = prepareSendingDomain(input.request);
  const db = input.prisma ?? defaultPrisma;
  const current = await loadIdentity(db, input.workspaceId);
  if (
    current?.providerDomainId &&
    (current.customDomain !== prepared.sendingDomain ||
      current.returnPathLabel !== prepared.returnPathLabel)
  ) {
    throw new CustomSendingError(
      "This workspace already has a registered sending domain. The return path cannot be changed in place.",
      "DOMAIN_LOCKED",
    );
  }

  let providerId = current?.providerDomainId ?? null;
  let status = current?.domainStatus ?? "NONE";
  let records = recordsFromJson(current?.dnsRecordsJson ?? null);
  if (!providerId) {
    const snapshot = await registerDomain(requireApi(input.resend ?? null), {
      name: prepared.sendingDomain,
      returnPathLabel: prepared.returnPathLabel,
    });
    if (snapshot.name !== prepared.sendingDomain) {
      throw new CustomSendingError(
        "The email provider registered a different domain.",
        "RESEND_DOMAIN_MISMATCH",
        502,
      );
    }
    providerId = snapshot.id;
    status = providerStatus(snapshot.status);
    records = snapshot.records;
  }

  const domainStatus = status === "NONE" ? "PENDING" : status;
  const keepEnabled =
    Boolean(current?.customSendingEnabled) &&
    domainStatus === "VERIFIED" &&
    current?.customDomain === prepared.sendingDomain &&
    current.returnPathLabel === prepared.returnPathLabel;
  const saved = await db.workspaceEmailIdentity.upsert({
    where: { workspaceId: input.workspaceId },
    create: {
      workspaceId: input.workspaceId,
      senderDisplayName: prepared.senderDisplayName,
      replyToEmail: prepared.replyToEmail,
      customDomain: prepared.sendingDomain,
      fromEmail: prepared.fromEmail,
      returnPathLabel: prepared.returnPathLabel,
      providerDomainId: providerId,
      customSendingEnabled: false,
      domainStatus,
      dnsRecordsJson: records,
    },
    update: {
      senderDisplayName: prepared.senderDisplayName,
      replyToEmail: prepared.replyToEmail,
      customDomain: prepared.sendingDomain,
      fromEmail: prepared.fromEmail,
      returnPathLabel: prepared.returnPathLabel,
      providerDomainId: providerId,
      customSendingEnabled: keepEnabled,
      domainStatus,
      dnsRecordsJson: records,
    },
  });

  await writePlatformAuditEvent(
    {
      actorOperatorId: input.operatorId,
      actorType: "OPERATOR",
      action: "custom_sending.prepare",
      entityType: "WorkspaceEmailIdentity",
      entityId: input.workspaceId,
      summary: `Prepared custom sending for ${prepared.sendingDomain}. Sending stays off.`,
      metadata: { domain: prepared.sendingDomain, status: saved.domainStatus },
    },
    db,
  );
  return toView(saved, isResendConfigured());
}

async function refresh(input: {
  db: PrismaClient;
  identity: NonNullable<Awaited<ReturnType<typeof loadIdentity>>>;
  resend: ResendDomainClient;
}) {
  if (!input.identity.providerDomainId || !input.identity.customDomain) {
    throw new CustomSendingError(
      "Register a sending domain before checking verification.",
      "DOMAIN_NOT_PREPARED",
    );
  }
  const snapshot = await readSnapshot(
    input.resend,
    input.identity.providerDomainId,
    input.identity.customDomain,
  );
  if (snapshot.name !== input.identity.customDomain) {
    throw new CustomSendingError(
      "The provider domain does not match this workspace.",
      "RESEND_DOMAIN_MISMATCH",
      502,
    );
  }
  const domainStatus = providerStatus(snapshot.status);
  return input.db.workspaceEmailIdentity.update({
    where: { workspaceId: input.identity.workspaceId },
    data: {
      domainStatus,
      dnsRecordsJson: snapshot.records,
      customSendingEnabled:
        domainStatus === "VERIFIED" ? input.identity.customSendingEnabled : false,
    },
  });
}

export async function checkCustomSending(input: {
  prisma?: PrismaClient;
  operatorId: string;
  workspaceId: string;
  resend?: ResendDomainClient | null;
}): Promise<CustomSendingView> {
  const db = input.prisma ?? defaultPrisma;
  const identity = await loadIdentity(db, input.workspaceId);
  if (!identity) {
    throw new CustomSendingError(
      "Register a sending domain before checking verification.",
      "DOMAIN_NOT_PREPARED",
    );
  }
  const saved = await refresh({
    db,
    identity,
    resend: requireApi(input.resend ?? null),
  });
  await writePlatformAuditEvent(
    {
      actorOperatorId: input.operatorId,
      actorType: "OPERATOR",
      action: "custom_sending.check",
      entityType: "WorkspaceEmailIdentity",
      entityId: input.workspaceId,
      summary: `Checked custom sending for ${saved.customDomain ?? "the workspace"}.`,
      metadata: { domain: saved.customDomain, status: saved.domainStatus },
    },
    db,
  );
  return toView(saved, true);
}

export async function setCustomSendingEnabled(input: {
  prisma?: PrismaClient;
  operatorId: string;
  workspaceId: string;
  enabled: boolean;
  resend?: ResendDomainClient | null;
}): Promise<CustomSendingView> {
  const db = input.prisma ?? defaultPrisma;
  const identity = await loadIdentity(db, input.workspaceId);
  if (!identity) {
    throw new CustomSendingError(
      "Register a sending domain before enabling it.",
      "DOMAIN_NOT_PREPARED",
    );
  }
  if (!input.enabled) {
    const saved = await db.workspaceEmailIdentity.update({
      where: { workspaceId: input.workspaceId },
      data: { customSendingEnabled: false },
    });
    await writePlatformAuditEvent(
      {
        actorOperatorId: input.operatorId,
        actorType: "OPERATOR",
        action: "custom_sending.disable",
        entityType: "WorkspaceEmailIdentity",
        entityId: input.workspaceId,
        summary: "Disabled custom sending. The HouzzatPRO sender remains in use.",
        metadata: { domain: saved.customDomain, status: saved.domainStatus },
      },
      db,
    );
    return toView(saved, isResendConfigured());
  }

  const refreshed = await refresh({
    db,
    identity,
    resend: requireApi(input.resend ?? null),
  });
  if (refreshed.domainStatus !== "VERIFIED") {
    throw new CustomSendingError(
      "Custom sending stays off until the provider verifies the domain.",
      "NOT_VERIFIED",
    );
  }
  const header = enabledCustomFromHeader({ ...refreshed, customSendingEnabled: true });
  if (!header) {
    throw new CustomSendingError(
      "The saved From address is not on the verified domain.",
      "FROM_DOMAIN_MUST_BE_VERIFIED",
    );
  }
  const saved = await db.workspaceEmailIdentity.update({
    where: { workspaceId: input.workspaceId },
    data: { customSendingEnabled: true },
  });
  await writePlatformAuditEvent(
    {
      actorOperatorId: input.operatorId,
      actorType: "OPERATOR",
      action: "custom_sending.enable",
      entityType: "WorkspaceEmailIdentity",
      entityId: input.workspaceId,
      summary: `Enabled custom sending for ${saved.customDomain ?? "the workspace"}.`,
      metadata: { domain: saved.customDomain, status: saved.domainStatus },
    },
    db,
  );
  return toView(saved, true);
}

export async function sendCustomSendingTest(input: {
  prisma?: PrismaClient;
  operatorId: string;
  workspaceId: string;
  to: string;
  resend?: ResendDomainClient | null;
}): Promise<{ sent: boolean; from: string }> {
  const db = input.prisma ?? defaultPrisma;
  const identity = await loadIdentity(db, input.workspaceId);
  if (!identity) {
    throw new CustomSendingError(
      "Register a sending domain before sending a test.",
      "DOMAIN_NOT_PREPARED",
    );
  }
  const refreshed = await refresh({
    db,
    identity,
    resend: requireApi(input.resend ?? null),
  });
  if (refreshed.domainStatus !== "VERIFIED" || !refreshed.fromEmail || !refreshed.senderDisplayName) {
    throw new CustomSendingError(
      "A test can be sent only after the provider verifies the domain. The HouzzatPRO sender stays in use.",
      "NOT_VERIFIED",
    );
  }
  const from = formatCustomFromHeader(refreshed.senderDisplayName, refreshed.fromEmail);
  const to = input.to.trim().toLowerCase();
  if (!to.includes("@")) {
    throw new CustomSendingError("Enter a recipient for the test email.", "INVALID_RECIPIENT");
  }
  const result = await sendRenderedEmail({
    to,
    from,
    replyTo: refreshed.replyToEmail,
    stream: "notify",
    rendered: {
      kind: "custom_sending_test",
      subject: "HouzzatPRO custom sending test",
      text: "This is a sending-domain test. It is not an account activation or a payment invitation.",
      html: "<p>This is a sending-domain test. It is not an account activation or a payment invitation.</p>",
    },
  });
  if (!result.ok) {
    throw new CustomSendingError(result.error, "TEST_SEND_FAILED", 502);
  }
  await writePlatformAuditEvent(
    {
      actorOperatorId: input.operatorId,
      actorType: "OPERATOR",
      action: "custom_sending.test",
      entityType: "WorkspaceEmailIdentity",
      entityId: input.workspaceId,
      summary: `Sent a custom sending test for ${refreshed.customDomain ?? "the workspace"}.`,
      metadata: { domain: refreshed.customDomain, status: refreshed.domainStatus },
    },
    db,
  );
  return { sent: result.status === "sent", from };
}

export async function resolveEnabledCustomFrom(
  workspaceId: string,
  db: PrismaClient = defaultPrisma,
): Promise<string | null> {
  const identity = await db.workspaceEmailIdentity.findUnique({
    where: { workspaceId },
    select: {
      domainStatus: true,
      customSendingEnabled: true,
      customDomain: true,
      fromEmail: true,
      senderDisplayName: true,
    },
  });
  return enabledCustomFromHeader(identity);
}
