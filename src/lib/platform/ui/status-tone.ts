type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

export function platformStatusTone(status: string): BadgeTone {
  const normalized = status.toUpperCase();
  if (
    normalized === "ACTIVE" ||
    normalized === "COMPLETED" ||
    normalized === "ACCEPTED" ||
    normalized === "GRANDFATHERED" ||
    normalized === "VERIFIED"
  ) {
    return "success";
  }
  if (
    normalized === "SUSPENDED" ||
    normalized === "PAST_DUE" ||
    normalized === "FAILED" ||
    normalized === "CANCELED" ||
    normalized === "CANCELLED" ||
    normalized === "EXPIRED" ||
    normalized === "REVOKED"
  ) {
    return "danger";
  }
  if (
    normalized === "PENDING" ||
    normalized === "DRAFT" ||
    normalized === "IN_PROGRESS" ||
    normalized === "PROCESSING" ||
    normalized === "TRIALING"
  ) {
    return "warning";
  }
  if (normalized === "SENT" || normalized === "VIEWED") {
    return "info";
  }
  return "neutral";
}
