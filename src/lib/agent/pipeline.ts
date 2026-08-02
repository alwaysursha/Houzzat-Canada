import type { LeadStatus } from "@prisma/client";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Phone,
} from "lucide-react";

export const PIPELINE_STATUSES: LeadStatus[] = [
  "NEW_LEAD",
  "ATTEMPTED_CONTACT",
  "CONTACTED",
  "APPT_SET",
  "APPT_MET",
  "ACTIVE_CLIENT",
  "PENDING_CLIENT",
  "PAST_CLIENT",
];

export const PIPELINE_STATUS_ORDER: Record<LeadStatus, number> =
  Object.fromEntries(
    PIPELINE_STATUSES.map((s, i) => [s, i]),
  ) as Record<LeadStatus, number>;

type PipelineMeta = {
  label: string;
  /** Short label for dense table cells. */
  shortLabel: string;
  icon: LucideIcon;
  /** Full-width profile banner / trigger background + text. */
  bannerClass: string;
  /** Table pill tone. */
  pillClass: string;
  /** Icon color in the open menu. */
  iconClass: string;
};

const PIPELINE_META: Record<LeadStatus, PipelineMeta> = {
  NEW_LEAD: {
    label: "New Lead",
    shortLabel: "NEW LEAD",
    icon: AlertCircle,
    bannerClass: "bg-[#e11d48] text-white",
    pillClass: "border-[#fca5a5]/80 text-[#b91c1c] bg-[#fef2f2]",
    iconClass: "text-[#e11d48]",
  },
  ATTEMPTED_CONTACT: {
    label: "Attempted Contact",
    shortLabel: "ATTEMPTED",
    icon: Phone,
    bannerClass: "bg-[#ea580c] text-white",
    pillClass: "border-[#fdba74]/80 text-[#c2410c] bg-[#fff7ed]",
    iconClass: "text-[#ea580c]",
  },
  CONTACTED: {
    label: "Contacted",
    shortLabel: "CONTACTED",
    icon: CheckCircle2,
    bannerClass: "bg-[#16a34a] text-white",
    pillClass: "border-[#86efac]/80 text-[#15803d] bg-[#f0fdf4]",
    iconClass: "text-[#16a34a]",
  },
  APPT_SET: {
    label: "Appt Set",
    shortLabel: "APPT SET",
    icon: Circle,
    bannerClass: "bg-[#64748b] text-white",
    pillClass: "border-[#cbd5e1] text-[#475569] bg-[#f8fafc]",
    iconClass: "text-[#64748b]",
  },
  APPT_MET: {
    label: "Appt Met",
    shortLabel: "APPT MET",
    icon: Circle,
    bannerClass: "bg-[#64748b] text-white",
    pillClass: "border-[#cbd5e1] text-[#475569] bg-[#f8fafc]",
    iconClass: "text-[#64748b]",
  },
  ACTIVE_CLIENT: {
    label: "Active Client",
    shortLabel: "ACTIVE",
    icon: Circle,
    bannerClass: "bg-[#0f766e] text-white",
    pillClass: "border-[#99f6e4]/80 text-[#0f766e] bg-[#f0fdfa]",
    iconClass: "text-[#0f766e]",
  },
  PENDING_CLIENT: {
    label: "Pending Client",
    shortLabel: "PENDING",
    icon: Circle,
    bannerClass: "bg-[#475569] text-white",
    pillClass: "border-[#cbd5e1] text-[#334155] bg-[#f1f5f9]",
    iconClass: "text-[#475569]",
  },
  PAST_CLIENT: {
    label: "Past Client",
    shortLabel: "PAST",
    icon: Circle,
    bannerClass: "bg-[#94a3b8] text-white",
    pillClass: "border-[#e2e8f0] text-[#94a3b8] bg-[#f8fafc]",
    iconClass: "text-[#94a3b8]",
  },
};

export function isLeadStatus(value: string): value is LeadStatus {
  return (PIPELINE_STATUSES as string[]).includes(value);
}

export function pipelineLabel(status: LeadStatus | string): string {
  if (isLeadStatus(status)) return PIPELINE_META[status].label;
  return status.replaceAll("_", " ");
}

export function pipelineShortLabel(status: LeadStatus | string): string {
  if (isLeadStatus(status)) return PIPELINE_META[status].shortLabel;
  return status.replaceAll("_", " ").toUpperCase();
}

export function pipelineIcon(status: LeadStatus | string): LucideIcon {
  if (isLeadStatus(status)) return PIPELINE_META[status].icon;
  return Circle;
}

export function pipelineBannerClass(status: LeadStatus | string): string {
  if (isLeadStatus(status)) return PIPELINE_META[status].bannerClass;
  return "bg-[#64748b] text-white";
}

export function pipelinePillClass(status: LeadStatus | string): string {
  if (isLeadStatus(status)) return PIPELINE_META[status].pillClass;
  return "border-[#e2e8f0] text-[#64748b] bg-[#f8fafc]";
}

export function pipelineIconClass(status: LeadStatus | string): string {
  if (isLeadStatus(status)) return PIPELINE_META[status].iconClass;
  return "text-[#64748b]";
}

export function pipelineStatusDate(
  statusChangedAt: string | Date | null | undefined,
  createdAt: string | Date,
): string {
  const raw = statusChangedAt ?? createdAt;
  const d = typeof raw === "string" ? new Date(raw) : raw;
  return d.toLocaleDateString("en-US");
}

/** Zod enum tuple for API validation. */
export const LEAD_STATUS_ZOD = [
  "NEW_LEAD",
  "ATTEMPTED_CONTACT",
  "CONTACTED",
  "APPT_SET",
  "APPT_MET",
  "ACTIVE_CLIENT",
  "PENDING_CLIENT",
  "PAST_CLIENT",
] as const;
