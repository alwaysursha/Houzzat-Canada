import { sendRenderedEmail } from "@/lib/email/send";
import type { RenderedEmail } from "@/lib/email/templates";
import type { MlsHealthAlert } from "@/lib/mls-health/types";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function subjectFor(alert: MlsHealthAlert): string {
  const name =
    alert.lines.length === 1
      ? alert.lines[0]!.signal.replaceAll("_", " ")
      : `${alert.lines.length} signals`;
  if (alert.kind === "recovered") return `[Houzzat MLS] recovered: ${name}`;
  if (alert.kind === "reminder") return `[Houzzat MLS] reminder: ${name}`;
  if (alert.kind === "escalated") return `[Houzzat MLS] critical: ${name}`;
  return `[Houzzat MLS] ${alert.severity}: ${name}`;
}

export function renderMlsHealthAlert(alert: MlsHealthAlert): RenderedEmail {
  const subject = subjectFor(alert);
  const intro =
    alert.kind === "recovered"
      ? "These MLS health signals have recovered."
      : alert.kind === "reminder"
        ? "These MLS health signals are still critical."
        : alert.kind === "escalated"
          ? "These MLS health signals escalated to critical."
          : "These MLS health signals opened.";
  const lines = alert.lines.map(
    (item) => `${item.severity} ${item.signal}: ${item.summary}`,
  );
  const text = [intro, "", ...lines].join("\n");
  const html = `<p>${escapeHtml(intro)}</p><ul>${lines
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("")}</ul>`;
  return { subject, text, html, kind: "mls_health" };
}

export function mlsHealthAlertRecipient(): string | null {
  const recipient = process.env.MLS_HEALTH_ALERT_EMAIL?.trim();
  return recipient || null;
}

/**
 * Sends one Resend email per alert batch.
 * Throws when mail cannot be sent so the caller does not mark the incident notified.
 */
export async function sendMlsHealthAlerts(alerts: MlsHealthAlert[]): Promise<void> {
  const to = mlsHealthAlertRecipient();
  if (!to) {
    throw new Error("MLS_HEALTH_ALERT_EMAIL is not set");
  }
  for (const alert of alerts) {
    const result = await sendRenderedEmail({
      to,
      rendered: renderMlsHealthAlert(alert),
      stream: "notify",
    });
    if (!result.ok || result.status !== "sent") {
      throw new Error("MLS health alert was not sent");
    }
  }
}
