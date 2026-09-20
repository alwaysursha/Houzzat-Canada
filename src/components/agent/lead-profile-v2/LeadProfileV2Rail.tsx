import Link from "next/link";
import { Eye, Heart, Mail, MessageSquare, Phone, Search } from "lucide-react";
import { LeadAccountVerifyMenu } from "@/components/agent/LeadAccountVerifyMenu";
import { LeadActions } from "@/components/agent/LeadActions";
import { PipelineStatusMenu } from "@/components/agent/PipelineStatusMenu";
import { ReassignSelect } from "@/components/agent/TeamAdminClient";
import {
  ContactDisplayRow,
  ContactEditRow,
  MapPin,
} from "@/components/agent/lead-profile-v2/contact-fields";
import type {
  LeadProfileV2BuyerIntent,
  LeadProfileV2NextReminder,
  LeadProfileV2RailPanel,
  LeadProfileV2Shell,
} from "@/lib/agent/lead-profile-v2/types";
import {
  buyerIntentToSearchHref,
  hasUsableSearchCriteria,
} from "@/lib/agent/intent-to-search";
import {
  INQUIRY_TAG_LABEL,
  INQUIRY_TAG_STYLE,
} from "@/lib/agent/inquiry-tag";
import {
  formatV2LastVisitHeader,
  formatV2RelativeAgo,
  v2EmailRingRates,
  v2RailBlueStatTiles,
} from "@/lib/agent/lead-profile-v2/rail-query";
import { cn } from "@/lib/utils";
import { contactSmsHref, contactTelHref } from "@/lib/sms/e164";

function RingStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  const pct = Math.min(100, Math.max(0, Math.round(value)));
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
      <div
        className="relative flex size-14 shrink-0 items-center justify-center rounded-full sm:size-16"
        style={{
          background: `conic-gradient(${tone} ${pct * 3.6}deg, #dbeafe 0deg)`,
        }}
      >
        <div className="flex size-10 items-center justify-center rounded-full bg-[#e0f2fe] text-[11px] font-bold tabular-nums text-[#0c4a6e] sm:size-12 sm:text-[12px]">
          {pct}%
        </div>
      </div>
      <p className="max-w-[4.5rem] text-center text-[10px] font-semibold leading-tight text-[#0369a1]">
        {label}
      </p>
    </div>
  );
}

type ActionItem = {
  icon: typeof Phone;
  href?: string;
  className: string;
  label: string;
};

function renderAction(action: ActionItem, size: "rail" | "inline") {
  const Icon = action.icon;
  const className = cn(
    "flex items-center justify-center rounded-full text-white shadow-md transition hover:scale-105",
    size === "rail" ? "size-11" : "size-10",
    action.className,
    !action.href && "pointer-events-none opacity-40",
  );
  if (action.href) {
    return (
      <a
        key={action.label}
        href={action.href}
        className={className}
        title={action.label}
        aria-label={action.label}
      >
        <Icon className="size-4" />
      </a>
    );
  }
  return (
    <span key={action.label} className={className} title={action.label}>
      <Icon className="size-4" />
    </span>
  );
}

export function LeadProfileV2Rail({
  leadId,
  data,
  rail,
  lookingFor,
  nextReminder,
  variant,
  editingContact,
  contactDraft,
  contactPending,
  contactError,
  reminderPending,
  profileFlagPending,
  onEditContact,
  onChangeDraft,
  onSaveContact,
  onCancelEdit,
  onRequestUpdate,
  onToggleBuyer,
  onToggleSeller,
  onUpdated,
  onClaimUpdated,
  onPipelineUpdated,
  onReassignUpdated,
  onOpenEngagement,
}: {
  leadId: string;
  data: LeadProfileV2Shell;
  rail: LeadProfileV2RailPanel | null;
  lookingFor: LeadProfileV2BuyerIntent | null;
  nextReminder: LeadProfileV2NextReminder | null;
  variant: "page" | "modal";
  editingContact: "phone" | "email" | "address" | null;
  contactDraft: string;
  contactPending: boolean;
  contactError: string | null;
  reminderPending: "phone" | "email" | null;
  profileFlagPending: "buyer" | "seller" | "timeframe" | null;
  onEditContact: (field: "phone" | "email" | "address") => void;
  onChangeDraft: (value: string) => void;
  onSaveContact: () => void;
  onCancelEdit: () => void;
  onRequestUpdate: (channel: "phone" | "email") => void;
  onToggleBuyer: () => void;
  onToggleSeller: () => void;
  onUpdated: () => void;
  onClaimUpdated: () => void;
  onPipelineUpdated: () => void;
  onReassignUpdated: () => void;
  onOpenEngagement: () => void;
}) {
  const name =
    data.lead.customer?.name ||
    data.lead.customer?.email ||
    data.lead.source.replaceAll("_", " ") ||
    "Lead";
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  const phone = data.lead.customer?.phone;
  const phoneE164 = data.lead.customer?.phoneE164;
  const telHref = contactTelHref(phone, phoneE164);
  const smsHref = contactSmsHref(phone, phoneE164);
  const email = data.lead.customer?.email;
  const address = data.lead.customer?.homeAddress;
  const rings = v2EmailRingRates(rail);

  const actions: ActionItem[] = [
    {
      icon: Phone,
      href: telHref,
      className: "bg-[#0d9488]",
      label: "Call",
    },
    {
      icon: MessageSquare,
      href: smsHref,
      className: "bg-[#0ea5e9]",
      label: "Text",
    },
    {
      icon: Mail,
      href: email ? `mailto:${email}` : undefined,
      className: "bg-[#38bdf8]",
      label: "Email",
    },
  ];

  return (
    <aside className="shrink-0 border-b border-[#e8edf2] bg-white px-4 py-3 lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:px-5 lg:py-4">
      {variant === "page" ? (
        <Link
          href="/agent/leads"
          className="mb-3 inline-flex text-[12px] font-semibold text-[#2b6cb0] hover:underline"
        >
          ← Leads
        </Link>
      ) : null}
      <div className="flex flex-col items-stretch text-left lg:items-center lg:text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-[#334155] text-xl font-bold text-white sm:size-[72px]">
          {initials || "?"}
        </div>
        <div className="relative z-10 mt-3 flex max-w-full items-center justify-center gap-1.5 px-1">
          <h2 className="min-w-0 break-words text-center text-[22px] font-bold leading-tight text-[#1e2a38] sm:text-[26px]">
            {name}
          </h2>
          {data.lead.customer ? (
            <LeadAccountVerifyMenu
              leadId={leadId}
              emailVerified={Boolean(data.lead.customer.emailVerified)}
              accountCreatedAt={data.lead.customer.createdAt}
              onUpdated={onUpdated}
            />
          ) : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5">
          {rail?.hot.isOnline ? (
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
              ONLINE
            </span>
          ) : null}
          {rail?.hot.binge ? (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
              BINGE · {rail.hot.distinctListings24h} homes
            </span>
          ) : null}
        </div>
        <div className="mt-2 flex w-full min-w-0 flex-col items-stretch gap-2.5 px-0">
          {editingContact === "phone" ? (
            <ContactEditRow
              type="tel"
              value={contactDraft}
              pending={contactPending}
              onChange={onChangeDraft}
              onSave={onSaveContact}
              onCancel={onCancelEdit}
            />
          ) : (
            <ContactDisplayRow
              icon={Phone}
              value={phone}
              href={telHref}
              canEdit={Boolean(data.lead.customer)}
              onEdit={() => onEditContact("phone")}
              editLabel="Edit phone"
              updateRequested={Boolean(
                data.lead.customer?.phoneUpdateRequestedAt,
              )}
              canRequestUpdate={Boolean(data.lead.customer)}
              onRequestUpdate={() => onRequestUpdate("phone")}
              requestLabel="Email and notify the client to confirm phone"
              requestPending={reminderPending === "phone"}
            />
          )}
          {editingContact === "email" ? (
            <ContactEditRow
              type="email"
              value={contactDraft}
              pending={contactPending}
              onChange={onChangeDraft}
              onSave={onSaveContact}
              onCancel={onCancelEdit}
            />
          ) : (
            <ContactDisplayRow
              icon={Mail}
              value={email}
              href={email ? `mailto:${email}` : undefined}
              canEdit={Boolean(data.lead.customer)}
              onEdit={() => onEditContact("email")}
              editLabel="Edit email"
              updateRequested={Boolean(
                data.lead.customer?.emailUpdateRequestedAt,
              )}
              canRequestUpdate={Boolean(data.lead.customer)}
              onRequestUpdate={() => onRequestUpdate("email")}
              requestLabel="Email and notify the client to confirm email"
              requestPending={reminderPending === "email"}
            />
          )}
          {editingContact === "address" ? (
            <ContactEditRow
              type="text"
              value={contactDraft}
              pending={contactPending}
              onChange={onChangeDraft}
              onSave={onSaveContact}
              onCancel={onCancelEdit}
            />
          ) : (
            <ContactDisplayRow
              icon={MapPin}
              value={address}
              href={
                address
                  ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
                  : undefined
              }
              canEdit={Boolean(data.lead.customer)}
              onEdit={() => onEditContact("address")}
              editLabel="Edit address"
              multiline
            />
          )}
          {contactError ? (
            <p className="text-center text-[11px] text-red-600">
              {contactError}
            </p>
          ) : null}
        </div>
      </div>

      {variant === "page" ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
          {actions.map((action) => renderAction(action, "inline"))}
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] font-medium text-[#1e2a38]">
        <button
          type="button"
          disabled={!data.lead.customer || profileFlagPending !== null}
          aria-pressed={Boolean(data.lead.customer?.isBuyer)}
          aria-label={
            data.lead.customer?.isBuyer
              ? "Deactivate buyer profile"
              : "Activate buyer profile"
          }
          title={
            data.lead.customer?.isBuyer
              ? "Buyer profile active — click to deactivate"
              : "Buyer profile inactive — click to activate"
          }
          onClick={onToggleBuyer}
          className="inline-flex items-center gap-2 rounded-md px-1.5 py-1 transition hover:bg-[#f1f5f9] disabled:cursor-default disabled:opacity-50"
        >
          <span
            className={cn(
              "inline-flex size-4 shrink-0 items-center justify-center rounded-full border-2",
              data.lead.customer?.isBuyer
                ? "border-[#0d9488] bg-white"
                : "border-[#cbd5e1] bg-white",
            )}
          >
            {data.lead.customer?.isBuyer ? (
              <span className="size-2 rounded-full bg-[#0d9488]" />
            ) : null}
          </span>
          Buyer
        </button>
        <button
          type="button"
          disabled={!data.lead.customer || profileFlagPending !== null}
          aria-pressed={Boolean(data.lead.customer?.isSeller)}
          aria-label={
            data.lead.customer?.isSeller
              ? "Deactivate seller profile"
              : "Activate seller profile"
          }
          title={
            data.lead.customer?.isSeller
              ? "Seller profile active — click to deactivate"
              : "Seller profile inactive — click to activate"
          }
          onClick={onToggleSeller}
          className="inline-flex items-center gap-2 rounded-md px-1.5 py-1 transition hover:bg-[#f1f5f9] disabled:cursor-default disabled:opacity-50"
        >
          <span
            className={cn(
              "inline-flex size-4 shrink-0 items-center justify-center rounded-full border-2",
              data.lead.customer?.isSeller
                ? "border-[#0d9488] bg-white"
                : "border-[#cbd5e1] bg-white",
            )}
          >
            {data.lead.customer?.isSeller ? (
              <span className="size-2 rounded-full bg-[#0d9488]" />
            ) : null}
          </span>
          Seller
        </button>
      </div>

      {data.lead.inquiryTag ? (
        <div className="mt-3 flex justify-center">
          <span
            className={cn(
              "rounded-full px-3 py-1 text-[11px] font-bold",
              INQUIRY_TAG_STYLE[data.lead.inquiryTag].soft,
            )}
          >
            {INQUIRY_TAG_LABEL[data.lead.inquiryTag]}
          </span>
        </div>
      ) : null}

      {rail ? (
        <div className="mt-4 flex items-center justify-center gap-5 text-[#64748b]">
          <span className="inline-flex items-center gap-1 text-[12px] font-semibold">
            <Heart className="size-4 text-[#e11d48]" />
            {rail.stats.saves}
          </span>
          <span className="inline-flex items-center gap-1 text-[12px] font-semibold">
            <Eye className="size-4" />
            {rail.hot.views24h}
          </span>
          <span className="inline-flex items-center gap-1 text-[12px] font-semibold">
            <Search className="size-4" />
            {rail.stats.savedSearches}
          </span>
        </div>
      ) : null}

      <PipelineStatusMenu
        className="mt-4"
        leadId={leadId}
        status={data.lead.status}
        statusChangedAt={data.lead.statusChangedAt}
        createdAt={data.lead.createdAt}
        onUpdated={onPipelineUpdated}
      />

      {data.permissions.canClaim ? (
        <div className="mt-3 flex justify-center">
          <LeadActions
            leadId={leadId}
            status={data.lead.status}
            canClaim
            onUpdated={onClaimUpdated}
          />
        </div>
      ) : null}

      {data.permissions.canAssignLeads ? (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[12px] text-[#64748b]">
          <span className="font-semibold text-[#475569]">Assign</span>
          <ReassignSelect
            leadId={leadId}
            members={data.teamMembers}
            currentId={data.lead.assignedAgentId}
            onUpdated={onReassignUpdated}
          />
        </div>
      ) : (
        <p className="mt-3 text-center text-[13px] font-medium text-[#1e2a38]">
          Assigned to:{" "}
          <span className="font-semibold">
            {data.lead.assignedAgent?.name ||
              data.lead.assignedAgent?.email ||
              "Unassigned"}
          </span>
        </p>
      )}

      {lookingFor ? (
        <div className="mt-3 overflow-hidden rounded-xl border border-[#c7e0d4] bg-[linear-gradient(165deg,#f3faf6_0%,#ffffff_55%)] text-left shadow-[0_1px_0_rgb(15_118_90/0.06)]">
          <div className="flex items-start justify-between gap-2 border-b border-[#d8ebe2] px-3.5 py-2.5">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#0f766e]">
                Looking for
              </p>
              {lookingFor.headline ? (
                <p className="mt-0.5 truncate text-[13px] font-semibold text-[#134e4a]">
                  {lookingFor.headline}
                </p>
              ) : null}
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                lookingFor.source === "saved"
                  ? "bg-[#0f766e]/12 text-[#0f766e]"
                  : lookingFor.source === "thin"
                    ? "bg-[#f1f5f9] text-[#64748b]"
                    : "bg-[#ecfdf5] text-[#047857]",
              )}
            >
              {lookingFor.sourceLabel}
            </span>
          </div>
          <div className="px-3.5 py-3">
            <p className="text-[12.5px] leading-relaxed text-[#334155]">
              {lookingFor.summary}
            </p>
            {lookingFor.chips.length > 0 ? (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {lookingFor.chips.map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-[#0f766e] ring-1 ring-[#c7e0d4]"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            ) : null}
            {data.lead.listingMls ? (
              <p className="mt-2 text-[11px] font-medium text-[#64748b]">
                Inquiry listing · MLS {data.lead.listingMls}
              </p>
            ) : null}
            {hasUsableSearchCriteria(lookingFor.criteria) ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={buyerIntentToSearchHref(lookingFor.criteria)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg bg-[#0f766e] px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-[#0d9488]"
                >
                  View matching homes
                </Link>
                <button
                  type="button"
                  onClick={onOpenEngagement}
                  className="rounded-lg border border-[#c7e0d4] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#0f766e] hover:bg-[#f0fdf4]"
                >
                  Shortlist & email
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {nextReminder ? (
        <div className="mt-3 rounded-md border border-[#fde68a] bg-[#fffbeb] px-3 py-2 text-left text-[12px]">
          <p className="font-semibold text-[#92400e]">Next reminder</p>
          <p className="text-[#78350f]">{nextReminder.title}</p>
          <p className="text-[#a16207]">
            {new Date(nextReminder.dueAt).toLocaleString("en-CA", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        </div>
      ) : null}

      <div className="mt-3 rounded-md bg-[#e0f2fe] px-3 py-3">
        <div className="mb-3 flex flex-wrap justify-between gap-2 text-[11px] font-semibold text-[#0369a1]">
          <span>{formatV2RelativeAgo(data.lastTouchAt)} (Last Touch)</span>
          <span>
            {formatV2LastVisitHeader({
              lastSeenAt: rail?.hot.lastSeenAt ?? null,
              isOnline: rail?.hot.isOnline ?? false,
            })}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
          {v2RailBlueStatTiles(rail).map(([label, value]) => (
            <div key={String(label)}>
              <p className="text-xl font-bold text-[#0c4a6e]">{value}</p>
              <p className="text-[10px] font-semibold text-[#0284c7]">
                {label}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 isolate rounded-md bg-[#e0f2fe] px-3 py-4">
        <p className="mb-3 text-center text-[11px] font-bold uppercase tracking-wide text-[#0369a1]">
          Email information
        </p>
        <div className="flex items-start justify-between gap-2">
          <RingStat
            label="Email Clicks"
            value={rings.clickRate}
            tone="#0ea5e9"
          />
          <RingStat
            label="Email Opens"
            value={rings.openRate}
            tone="#0284c7"
          />
          <RingStat
            label="Alert Opens"
            value={rings.alertRate}
            tone="#0369a1"
          />
        </div>
      </div>
    </aside>
  );
}

export function LeadProfileV2ActionRail({
  phone,
  phoneE164,
  email,
}: {
  phone: string | null | undefined;
  phoneE164: string | null | undefined;
  email: string | null | undefined;
}) {
  const actions: ActionItem[] = [
    {
      icon: Phone,
      href: contactTelHref(phone, phoneE164),
      className: "bg-[#0d9488]",
      label: "Call",
    },
    {
      icon: MessageSquare,
      href: contactSmsHref(phone, phoneE164),
      className: "bg-[#0ea5e9]",
      label: "Text",
    },
    {
      icon: Mail,
      href: email ? `mailto:${email}` : undefined,
      className: "bg-[#38bdf8]",
      label: "Email",
    },
  ];
  return (
    <div className="absolute -left-1 top-24 z-20 hidden flex-col gap-2 sm:flex md:-left-3">
      {actions.map((action) => renderAction(action, "rail"))}
    </div>
  );
}
