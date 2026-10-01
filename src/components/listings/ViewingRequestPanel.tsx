"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Search, UserRound } from "lucide-react";
import { WatchAreaButton } from "@/components/account/WatchAreaButton";
import { useListingContactDefaults } from "@/components/listings/ListingAccountChromeProvider";
import { LeadRequestForm } from "@/components/listings/LeadRequestForm";
import { ListingQaPanel } from "@/components/listings/ListingQaPanel";
import { useLeadRequestRestore } from "@/components/listings/useLeadRequestRestore";
import {
  LEAD_REQUEST_ENTRY_EVENT,
  peekLeadRequestEntry,
} from "@/lib/auth/lead-request-intent";
import {
  defaultViewingMessage,
  type ViewingContactDefaults,
} from "@/components/listings/ViewingBookingModal";
import { RoutePlannerToggleButton } from "@/components/route-planner/RoutePlannerToggleButton";
import { PUBLIC_AGENT_CONTACT_LABELS } from "@/lib/tenancy/professional-identity/presentation";
import type { PublicAgentIdentity } from "@/lib/tenancy/resolve-public-agent-identity";
import { cn } from "@/lib/utils";

function defaultInquiryMessage(mlsNumber: string) {
  return `I'd like details or something similar to MLS® ${mlsNumber}. Please contact me.`;
}

function agentInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function hasPublicAgentIdentity(agent: PublicAgentIdentity | null | undefined) {
  if (!agent) return false;
  return Boolean(
    agent.name?.trim() ||
      agent.title?.trim() ||
      agent.photoUrl?.trim() ||
      agent.brokerageName?.trim() ||
      agent.phone?.trim(),
  );
}

function PublicAgentIdentityBody({
  agent,
  compact = false,
}: {
  agent: PublicAgentIdentity;
  compact?: boolean;
}) {
  const showIdentity = hasPublicAgentIdentity(agent);
  const name = agent.name?.trim() || null;
  const title = agent.title?.trim() || null;
  const brokerage = agent.brokerageName?.trim() || null;
  const photoUrl = agent.photoUrl?.trim() || null;
  const phone = agent.phone?.trim() || null;
  const tel = phone ? phone.replace(/[^\d+]/g, "") : "";
  const firstName = name?.split(/\s+/)[0] ?? null;

  if (!showIdentity && !phone) return null;

  return (
    <div className={compact ? "space-y-4" : "space-y-5"}>
      {showIdentity ? (
        <div className={compact ? "flex gap-3" : "flex gap-4"}>
          <div
            className={
              compact
                ? "relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-mist"
                : "relative h-28 w-24 shrink-0 overflow-hidden rounded-2xl bg-mist"
            }
          >
            {photoUrl ? (
              // Tenant portrait hosts are not listed in next/image remotePatterns.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt=""
                className="h-full w-full object-cover object-center"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center font-sans text-xl font-semibold text-ink/55">
                {name ? (
                  agentInitials(name)
                ) : (
                  <UserRound className="size-7" aria-hidden />
                )}
              </span>
            )}
          </div>
          <div className="min-w-0 pt-0.5">
            {name ? (
              <p className="text-xs font-medium text-ink/45">Connect with</p>
            ) : null}
            {name ? (
              <p className="font-sans text-xl font-semibold leading-tight text-ink">
                {name}
              </p>
            ) : null}
            {title ? (
              <p className="mt-1 text-sm text-ink/70">{title}</p>
            ) : null}
            {brokerage ? (
              <p className="mt-0.5 text-sm text-ink/55">{brokerage}</p>
            ) : null}
          </div>
        </div>
      ) : null}
      {phone && tel ? (
        <div>
          <p className="text-xs font-medium text-ink/45">
            {PUBLIC_AGENT_CONTACT_LABELS.cell}
          </p>
          <p className="mt-0.5 font-sans text-lg font-semibold text-ink">{phone}</p>
          <a
            href={`tel:${tel}`}
            className="mt-3 inline-flex h-11 items-center justify-center rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-ink transition hover:border-canopy/35"
          >
            {firstName ? `Call ${firstName}` : "Call"}
          </a>
        </div>
      ) : null}
    </div>
  );
}

function PublicAgentConcierge({
  agent,
  expertWhatsApp,
  mlsNumber,
  addressLine,
  city,
}: {
  agent: PublicAgentIdentity | null | undefined;
  expertWhatsApp?: string | null;
  mlsNumber: string;
  addressLine: string;
  city: string;
}) {
  return (
    <div className="mb-6 hidden md:block space-y-5 border-b border-line/50 pb-6">
      {agent ? <PublicAgentIdentityBody agent={agent} /> : null}
      <ListingQaPanel
        variant="inline"
        mlsNumber={mlsNumber}
        addressLine={addressLine}
        city={city}
        title="Ask a question"
        hint=""
        expertWhatsApp={expertWhatsApp}
      />
    </div>
  );
}

/** Phone identity and WhatsApp. Not a second viewing form. */
export function MobilePublicAgentSection({
  agent,
  expertWhatsApp,
  mlsNumber,
  addressLine,
  city,
  inactive = false,
  onContactAgent,
}: {
  agent: PublicAgentIdentity | null | undefined;
  expertWhatsApp?: string | null;
  mlsNumber: string;
  addressLine: string;
  city: string;
  /** Inactive listings only. Active booking stays on the bottom bar. */
  inactive?: boolean;
  /** Opens the existing inactive inquiry owner. Not a second form. */
  onContactAgent?: () => void;
}) {
  const showIdentity = hasPublicAgentIdentity(agent);

  return (
    <section className="space-y-4 md:hidden">
      {showIdentity && agent ? (
        <PublicAgentIdentityBody agent={agent} compact />
      ) : (
        <h2 className="font-sans text-lg font-semibold tracking-tight text-ink">
          Questions about this home?
        </h2>
      )}
      <ListingQaPanel
        variant="inline"
        mlsNumber={mlsNumber}
        addressLine={addressLine}
        city={city}
        title="Ask a question"
        hint=""
        expertWhatsApp={expertWhatsApp}
      />
      {inactive ? (
        <button
          type="button"
          onClick={() => onContactAgent?.()}
          className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-ink"
        >
          Contact Agent
        </button>
      ) : null}
    </section>
  );
}

function useListingViewport(): "unknown" | "narrow" | "wide" {
  const [viewport, setViewport] = useState<"unknown" | "narrow" | "wide">(
    "unknown",
  );
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const sync = () => setViewport(media.matches ? "narrow" : "wide");
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  return viewport;
}

export function ViewingRequestPanel({
  mlsNumber,
  callbackPath,
  contact,
  inactive = false,
  similarHomesHref,
  city,
  community,
  transactionType = "SALE",
  segment,
  signedIn = false,
  className,
  claimRestore = "auto",
  mobileInquiryOpen = false,
  publicAgent = null,
  expertWhatsApp = null,
  addressLine = "",
}: {
  mlsNumber: string;
  /** Canonical SEO path for auth redirects. */
  callbackPath?: string;
  contact?: ViewingContactDefaults;
  inactive?: boolean;
  similarHomesHref?: string;
  city?: string;
  community?: string | null;
  transactionType?: "SALE" | "LEASE";
  segment?: "RESIDENTIAL" | "COMMERCIAL" | "PRE_CONSTRUCTION" | string;
  signedIn?: boolean;
  className?: string;
  /**
   * auto: the desktop panel claims the restore. The mobile booking sheet does.
   * always: this panel is the visible form at every width (map overlay).
   */
  claimRestore?: "auto" | "always";
  /** Phone asked to show the existing inactive inquiry form. */
  mobileInquiryOpen?: boolean;
  /** Workspace public agent. Not the customer's assigned lead. */
  publicAgent?: PublicAgentIdentity | null;
  expertWhatsApp?: string | null;
  addressLine?: string;
}) {
  const viewport = useListingViewport();
  const { status } = useSession();
  const narrow = viewport === "narrow";
  const [entryVersion, setEntryVersion] = useState(0);
  useEffect(() => {
    const onEntry = () => setEntryVersion((version) => version + 1);
    window.addEventListener(LEAD_REQUEST_ENTRY_EVENT, onEntry);
    return () => window.removeEventListener(LEAD_REQUEST_ENTRY_EVENT, onEntry);
  }, []);
  const galleryStarted =
    entryVersion >= 0 && peekLeadRequestEntry() === "gallery";
  const claim =
    (claimRestore === "always" || inactive || viewport === "wide") &&
    !galleryStarted;
  const restore = useLeadRequestRestore(mlsNumber, claim);
  const [mode, setMode] = useState<"showing" | "virtual_viewing">("showing");
  const [modeChosen, setModeChosen] = useState(false);
  const resolvedContact = useListingContactDefaults(contact);
  const watchSegment =
    segment === "COMMERCIAL" ? "COMMERCIAL" : ("RESIDENTIAL" as const);
  const similarHref =
    similarHomesHref ??
    `/search?status=ACTIVE&city=${encodeURIComponent(city ?? "")}`;
  const authCallbackUrl = callbackPath ?? `/listing/${mlsNumber}`;

  const restoredViewing =
    !modeChosen &&
    (restore?.kind === "showing" || restore?.kind === "virtual_viewing")
      ? restore.kind
      : mode;
  const showInquiryOnMobile =
    narrow && (restore?.kind === "inquiry" || mobileInquiryOpen);
  const inquiryShellRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!mobileInquiryOpen || !narrow) return;
    inquiryShellRef.current?.scrollIntoView({ block: "start" });
  }, [mobileInquiryOpen, narrow]);
  const shellClass = cn(
    // Parent column must be the tall grid aside — do not wrap this in a short
    // div, or sticky has no room to travel.
    // Sit just under site header + listing action bar.
    // Sheet/panel sets --site-header-stack and --listing-viewing-sticky-gap to 0
    // so this docks flush under the Share/Save bar (no phantom header gap).
    "sticky top-[calc(var(--site-header-stack,4rem)+var(--listing-sticky-bar-height,5.5rem)+var(--listing-viewing-sticky-gap,0.5rem))] z-10 rounded-2xl border border-line/50 bg-surface p-5 shadow-[0_1px_0_rgb(20_32_28/0.03)] sm:p-6",
    className,
  );
  const shellStyle = showInquiryOnMobile ? { display: "block" as const } : undefined;

  if (inactive) {
    return (
      <div
        id="listing-inquiry"
        ref={inquiryShellRef}
        className={shellClass}
        style={shellStyle}
      >
        <PublicAgentConcierge
          agent={publicAgent}
          expertWhatsApp={expertWhatsApp}
          mlsNumber={mlsNumber}
          addressLine={addressLine}
          city={city ?? ""}
        />
        <p className="text-xs font-medium text-ink/45">
          Next step
        </p>
        <h2 className="mt-1 font-sans font-semibold text-xl text-ink sm:text-2xl">
          Ask about this home
        </h2>
        <p className="mt-1.5 text-sm text-ink/60">
          This listing is no longer active. Send an inquiry and we’ll help with
          details or similar homes nearby.
        </p>
        <div className="mt-4">
          <LeadRequestForm
            key={`${status}-${restore?.kind === "inquiry" ? restore.restoredAt : "inquiry"}`}
            mlsNumber={mlsNumber}
            kind="inquiry"
            callbackPath={authCallbackUrl}
            restoreEntry="concierge"
            defaults={{
              name: resolvedContact?.name ?? "",
              email: resolvedContact?.email ?? "",
              phone: resolvedContact?.phone ?? "",
              message:
                restore?.kind === "inquiry" && restore.message
                  ? restore.message
                  : defaultInquiryMessage(mlsNumber),
            }}
          />
        </div>
        <div className="mt-5 space-y-2 border-t border-line pt-4 md:hidden">
          <p className="text-xs font-medium text-ink/45">
            Or continue browsing
          </p>
          {city ? (
            <div className="[&_button]:h-11 [&_button]:w-full [&_button]:justify-center">
              <WatchAreaButton
                city={city}
                community={community ?? undefined}
                transactionType={transactionType}
                segment={watchSegment}
                signedIn={signedIn}
                idleLabel="Watch this area"
                authCallbackUrl={authCallbackUrl}
              />
            </div>
          ) : null}
          <Link
            href={similarHref}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-line bg-mist px-4 text-sm font-semibold text-ink transition hover:border-canopy/40"
          >
            <Search className="size-4" aria-hidden />
            Find similar homes
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={shellClass} style={shellStyle}>
      <PublicAgentConcierge
        agent={publicAgent}
        expertWhatsApp={expertWhatsApp}
        mlsNumber={mlsNumber}
        addressLine={addressLine}
        city={city ?? ""}
      />
      <p className="text-xs font-medium text-ink/45">
        Next step
      </p>
      <h2 className="mt-1 font-sans font-semibold text-xl text-ink sm:text-2xl">
        Book a viewing
      </h2>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${
            restoredViewing === "showing"
              ? "bg-canopy text-white shadow-sm"
              : "border border-line/70 bg-mist/40 text-ink/70"
          }`}
          onClick={() => {
            setModeChosen(true);
            setMode("showing");
          }}
        >
          In-person
        </button>
        <button
          type="button"
          className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${
            restoredViewing === "virtual_viewing"
              ? "bg-signal text-white shadow-sm"
              : "border border-line/70 bg-mist/40 text-ink/70"
          }`}
          onClick={() => {
            setModeChosen(true);
            setMode("virtual_viewing");
          }}
        >
          Virtual Viewing
        </button>
      </div>
      <div className="mt-4">
        <LeadRequestForm
          key={`${status}-${restoredViewing}-${restore?.restoredAt ?? "base"}`}
          mlsNumber={mlsNumber}
          kind={restoredViewing}
          callbackPath={authCallbackUrl}
          restoreEntry="concierge"
          defaults={{
            name: resolvedContact?.name ?? "",
            email: resolvedContact?.email ?? "",
            phone: resolvedContact?.phone ?? "",
            message:
              restore &&
              restore.kind === restoredViewing &&
              restore.message
                ? restore.message
                : defaultViewingMessage(mlsNumber, restoredViewing),
            focusNotes:
              restore?.kind === "virtual_viewing" &&
              restoredViewing === "virtual_viewing"
                ? (restore.focusNotes ?? "")
                : "",
          }}
        />
      </div>
      <div className="mt-5 border-t border-line/50 pt-4 [&_button]:h-11 [&_button]:w-full [&_button]:justify-center">
        <RoutePlannerToggleButton
          mlsNumber={mlsNumber}
          listingStatus="ACTIVE"
          size="button"
        />
      </div>
    </div>
  );
}
