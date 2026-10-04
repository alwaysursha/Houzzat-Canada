import type { ReactNode } from "react";
import { Check, BellRing, MapPin, Pencil, Phone, X, type LucideIcon } from "lucide-react";
import { ContactValidityIcon } from "@/components/agent/ContactValidityIcon";
import {
  formatPhoneAsYouType,
  formatPhoneDisplay,
} from "@/lib/phone/format";
import { cn } from "@/lib/utils";

export function ContactDisplayRow({
  icon: Icon,
  value,
  href,
  canEdit,
  onEdit,
  editLabel,
  updateRequested,
  canRequestUpdate,
  onRequestUpdate,
  requestLabel,
  requestPending,
  multiline = false,
  validityVerified,
}: {
  icon: LucideIcon;
  value: string | null | undefined;
  href?: string;
  canEdit: boolean;
  onEdit: () => void;
  editLabel: string;
  updateRequested?: boolean;
  canRequestUpdate?: boolean;
  onRequestUpdate?: () => void;
  requestLabel?: string;
  requestPending?: boolean;
  multiline?: boolean;
  /** When set, show the Leads-desk validity icon (independent of REQUESTED). */
  validityVerified?: boolean;
}) {
  const shown =
    Icon === Phone || href?.startsWith("tel:")
      ? formatPhoneDisplay(value) || value
      : value;
  const valueClass = multiline
    ? "min-w-0 break-words leading-snug"
    : "min-w-0 truncate";

  return (
    <div className="w-full min-w-0">
      <div className="flex w-full min-w-0 items-center gap-1.5">
        {href && value ? (
          <a
            href={href}
            target={multiline ? "_blank" : undefined}
            rel={multiline ? "noopener noreferrer" : undefined}
            className={cn(
              "flex min-w-0 text-[13px] text-[#2b6cb0] hover:underline",
              multiline ? "items-start gap-1.5" : "items-center gap-1.5",
              updateRequested ? "max-w-[40%]" : "flex-1",
            )}
          >
            <Icon className="size-3.5 shrink-0" />
            <span className={valueClass}>{shown}</span>
            {validityVerified !== undefined ? (
              <span
                className="shrink-0"
                title={validityVerified ? "Verified" : "Unverified"}
              >
                <ContactValidityIcon verified={validityVerified} />
              </span>
            ) : null}
          </a>
        ) : (
          <span
            className={cn(
              "flex min-w-0 text-[13px] text-[#94a3b8]",
              multiline ? "items-start gap-1.5" : "items-center gap-1.5",
              updateRequested ? "shrink-0" : "flex-1",
            )}
          >
            <Icon className="size-3.5 shrink-0" />
            <span className={valueClass}>{shown || "N/A"}</span>
            {validityVerified !== undefined ? (
              <span
                className="shrink-0"
                title={validityVerified ? "Verified" : "Unverified"}
              >
                <ContactValidityIcon verified={validityVerified} />
              </span>
            ) : null}
          </span>
        )}
        {updateRequested ? (
          <span className="inline-flex min-w-0 flex-1 items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-900">
            Requested
          </span>
        ) : null}
        {canEdit ? (
          <button
            type="button"
            onClick={onEdit}
            aria-label={editLabel}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-[#64748b] transition hover:bg-[#f1f5f9] hover:text-[#1e2a38]"
          >
            <Pencil className="size-3.5" />
          </button>
        ) : null}
        {canRequestUpdate && onRequestUpdate ? (
          <button
            type="button"
            onClick={onRequestUpdate}
            disabled={requestPending}
            aria-label={requestLabel ?? "Email and notify client to update"}
            title={
              updateRequested
                ? "Client has already been asked — email and push were sent"
                : (requestLabel ?? "Email and notify the client")
            }
            className={cn(
              "inline-flex size-7 shrink-0 items-center justify-center rounded-md transition disabled:opacity-50",
              updateRequested
                ? "bg-amber-100 text-amber-800"
                : "text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#1e2a38]",
            )}
          >
            <BellRing className="size-3.5" />
            {updateRequested ? (
              <span className="sr-only">Update requested</span>
            ) : null}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function ContactEditRow({
  type,
  value,
  pending,
  onChange,
  onSave,
  onCancel,
}: {
  type: "tel" | "email" | "text";
  value: string;
  pending: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const placeholder =
    type === "tel"
      ? "(647) 221 - 4949"
      : type === "email"
        ? "Email address"
        : "Home address";

  return (
    <div className="flex items-center gap-1">
      <input
        type={type}
        value={type === "tel" ? formatPhoneAsYouType(value) : value}
        autoFocus
        disabled={pending}
        onChange={(e) =>
          onChange(
            type === "tel"
              ? formatPhoneAsYouType(e.target.value)
              : e.target.value,
          )
        }
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSave();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        className="min-w-0 flex-1 rounded-md border border-[#cbd5e1] px-2 py-1 text-[13px] text-[#1e2a38] outline-none focus:border-[#0d9488]"
        placeholder={placeholder}
      />
      <button
        type="button"
        disabled={pending || (type === "email" && !value.trim())}
        onClick={onSave}
        aria-label="Save"
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-[#0d9488] text-white disabled:opacity-50"
      >
        <Check className="size-3.5" />
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={onCancel}
        aria-label="Cancel"
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-[#64748b] hover:bg-[#f1f5f9]"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

export function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2 border-b border-[#eef2f6] py-2 text-[13px] last:border-0 xl:grid-cols-[132px_1fr]">
      <dt className="font-medium text-[#94a3b8]">{label}</dt>
      <dd className="min-w-0 break-words font-medium text-[#1e2a38]">
        {value || "—"}
      </dd>
    </div>
  );
}

export function DetailColumn({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <h4 className="mb-1 text-[12px] font-bold uppercase tracking-[0.06em] text-[#64748b]">
        {title}
      </h4>
      <dl>{children}</dl>
    </div>
  );
}

export { MapPin, Phone };
