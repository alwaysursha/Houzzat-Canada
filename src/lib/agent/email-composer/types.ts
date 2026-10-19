/** Phase 1 CRM email composer — in-memory only (no durable drafts). */

export type EmailComposerWindowState =
  | "closed"
  | "open"
  | "minimized"
  | "maximized";

export type EmailComposerDraft = {
  leadId: string;
  /** Stable id for this in-memory composition (survives minimize/restore). */
  compositionId: string;
  toEmail: string;
  consented: boolean;
  recipientName: string | null;
  subject: string;
  body: string;
};

export type EmailComposerOpenInput = {
  leadId: string;
  toEmail: string | null | undefined;
  consented: boolean;
  recipientName?: string | null;
};

/**
 * Immutable snapshot captured when Send is clicked.
 * Recipient remains server-authoritative; this only binds leadId + body fields
 * and request identity for safe completion after navigation.
 * Workspace/agent authority stays on the session cookie for POST /api/agent/email.
 */
export type EmailComposerSendSnapshot = {
  requestId: string;
  leadId: string;
  compositionId: string;
  /** Host lead selected when the send started (for refresh gating). */
  hostLeadId: string;
  subject: string;
  body: string;
};

/**
 * Client interpretation of POST /api/agent/email for a single-lead send.
 * Never treat skipped/suppressed as a successful delivery.
 */
export type EmailComposerSendOutcome =
  | { kind: "sent" }
  | { kind: "skipped"; message: string }
  | { kind: "failed"; message: string }
  | { kind: "unauthorized"; message: string }
  | { kind: "invalid"; message: string };

export type AgentEmailApiResponse = {
  ok?: boolean;
  sent?: number;
  skipped?: number;
  errors?: string[];
  error?: string;
  delivery?: "sent" | "skipped" | "failed";
};
