import Link from "next/link";
import { HandoffClient } from "@/components/agent/HandoffClient";
import {
  DetailColumn,
  InfoRow,
} from "@/components/agent/lead-profile-v2/contact-fields";
import type {
  LeadProfileV2RailPanel,
  LeadProfileV2Shell,
} from "@/lib/agent/lead-profile-v2/types";
import {
  PURCHASE_TIMEFRAMES,
  purchaseTimeframeLabel,
  type PurchaseTimeframeValue,
} from "@/lib/agent/timeframe";
import {
  formatSellerTimeframeState,
  readSellerTimeframeState,
} from "@/lib/property-address/seller-timeframe";

function relativeAgo(iso: string | null) {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${Math.max(0, mins)} Min Ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} Hour${hours === 1 ? "" : "s"} Ago`;
  const days = Math.floor(hours / 24);
  return `${days} Day${days === 1 ? "" : "s"} Ago`;
}

export function LeadProfileV2InfoPanel({
  data,
  rail,
  savedSearchLabel,
  profileFlagPending,
  onTimeframe,
}: {
  data: LeadProfileV2Shell;
  rail: LeadProfileV2RailPanel | null;
  savedSearchLabel: string | null;
  profileFlagPending: "buyer" | "seller" | "timeframe" | null;
  onTimeframe: (next: PurchaseTimeframeValue | null) => void;
}) {
  return (
    <>
      <div className="rounded-lg border border-[#e2e8f0] bg-white px-4 py-3">
        <div className="mb-3 flex items-center justify-between border-b border-[#eef2f6] pb-2">
          <h3 className="text-[14px] font-bold text-[#1e2a38]">Details</h3>
        </div>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          <DetailColumn title="Key info">
            <InfoRow
              label="First name"
              value={data.lead.customer?.name?.split(/\s+/)[0]}
            />
            <InfoRow
              label="Last name"
              value={data.lead.customer?.name?.split(/\s+/).slice(1).join(" ")}
            />
            <InfoRow label="Email" value={data.lead.customer?.email} />
            <InfoRow label="Phone" value={data.lead.customer?.phone} />
            <InfoRow
              label="Claimed property"
              value={data.lead.customer?.homeAddress}
            />
            <InfoRow
              label="Unit #"
              value={data.lead.customer?.homeUnit}
            />
            <InfoRow
              label="Seller opportunity"
              value={
                data.lead.customer?.ownsHome &&
                data.lead.customer.homeAddress?.trim()
                  ? "Yes"
                  : data.lead.customer?.ownsHome
                    ? "Homeowner — no property claimed"
                    : null
              }
            />
            <InfoRow
              label="Selling timeframe"
              value={formatSellerTimeframeState(
                readSellerTimeframeState(data.lead.captureContext),
              )}
            />
            <InfoRow
              label="Listing"
              value={
                data.lead.listingMls ? (
                  <Link
                    href={`/listing/${data.lead.listingMls}`}
                    className="text-[#2b6cb0] hover:underline"
                  >
                    {data.lead.listingMls}
                  </Link>
                ) : null
              }
            />
            <InfoRow
              label="Buying timeframe"
              value={
                data.lead.customer ? (
                  <select
                    className="w-full max-w-[11rem] rounded-md border border-[#d8dee6] bg-white px-2 py-1 text-[13px] font-medium text-[#1e2a38]"
                    value={data.lead.customer.purchaseTimeframe ?? ""}
                    disabled={profileFlagPending !== null}
                    onChange={(e) => {
                      const v = e.target.value;
                      onTimeframe(
                        v === "" ? null : (v as PurchaseTimeframeValue),
                      );
                    }}
                    aria-label="Purchase timeframe"
                  >
                    <option value="">Not set</option>
                    {PURCHASE_TIMEFRAMES.map((tf) => (
                      <option key={tf} value={tf}>
                        {purchaseTimeframeLabel(tf)}
                      </option>
                    ))}
                  </select>
                ) : (
                  "—"
                )
              }
            />
            <InfoRow
              label="Homeowner"
              value={
                data.lead.customer?.ownsHome == null
                  ? null
                  : data.lead.customer.ownsHome
                    ? "Yes"
                    : "No / Rent"
              }
            />
            <InfoRow
              label="Mortgage"
              value={
                data.lead.customer?.mortgageFinancing === "PRE_APPROVED"
                  ? "Pre-approved"
                  : data.lead.customer?.mortgageFinancing === "NOT_PRE_APPROVED"
                    ? "Not pre-approved"
                    : data.lead.customer?.mortgageFinancing === "CASH"
                      ? "Buying with cash"
                      : null
              }
            />
            <InfoRow
              label="Mobile OTP"
              value={
                data.lead.customer
                  ? data.lead.customer.phoneOtpVerified
                    ? "Verified"
                    : "Unverified"
                  : null
              }
            />
            <InfoRow
              label="Captured while viewing"
              value={(() => {
                const ctx = data.lead.captureContext;
                if (!ctx || typeof ctx !== "object" || Array.isArray(ctx)) {
                  return data.lead.listingMls;
                }
                const c = ctx as Record<string, unknown>;
                const address =
                  typeof c.listingAddress === "string"
                    ? c.listingAddress
                    : null;
                const mls =
                  typeof c.mlsNumber === "string"
                    ? c.mlsNumber
                    : data.lead.listingMls;
                if (address && mls) return `${address} · MLS ${mls}`;
                return address || mls;
              })()}
            />
          </DetailColumn>

          <DetailColumn title="Assignment">
            <InfoRow
              label="Agent assigned"
              value={
                data.lead.assignedAgent?.name || data.lead.assignedAgent?.email
              }
            />
            <InfoRow
              label="Source"
              value={data.lead.source.replaceAll("_", " ")}
            />
            <InfoRow label="Score" value={String(data.lead.score)} />
            <InfoRow
              label="Hotness"
              value={rail ? String(rail.hot.hotness) : null}
            />
            <InfoRow label="Search" value={savedSearchLabel} />
            <InfoRow label="Campaign" value={data.lead.adCampaign?.name} />
            <InfoRow
              label="UTM source"
              value={
                data.lead.utmSource ||
                (() => {
                  const ctx = data.lead.captureContext;
                  if (!ctx || typeof ctx !== "object" || Array.isArray(ctx)) {
                    return null;
                  }
                  const v = (ctx as Record<string, unknown>).utmSource;
                  return typeof v === "string" ? v : null;
                })()
              }
            />
            <InfoRow
              label="Click ID"
              value={(() => {
                const ctx = data.lead.captureContext;
                if (!ctx || typeof ctx !== "object" || Array.isArray(ctx)) {
                  return null;
                }
                const c = ctx as Record<string, unknown>;
                const id = c.gclid || c.gbraid || c.wbraid;
                return typeof id === "string" ? id : null;
              })()}
            />
          </DetailColumn>

          <DetailColumn title="User data">
            <InfoRow
              label="Registered"
              value={new Date(data.lead.createdAt).toLocaleString("en-CA")}
            />
            <InfoRow
              label="Last visit"
              value={
                rail?.hot.lastSeenAt
                  ? new Date(rail.hot.lastSeenAt).toLocaleString("en-CA")
                  : null
              }
            />
            <InfoRow label="Last touch" value={relativeAgo(data.lastTouchAt)} />
            <InfoRow
              label="SLA open"
              value={
                rail?.hot.slaHoursOpen != null
                  ? `${rail.hot.slaHoursOpen.toFixed(1)}h`
                  : null
              }
            />
            <InfoRow
              label="Terms accepted at"
              value={
                data.lead.customer?.termsAcceptedAt
                  ? new Date(data.lead.customer.termsAcceptedAt).toLocaleString(
                      "en-CA",
                    )
                  : null
              }
            />
            <InfoRow
              label="PropTx agreement accepted at"
              value={
                data.lead.customer?.vowAcceptedAt
                  ? new Date(data.lead.customer.vowAcceptedAt).toLocaleString(
                      "en-CA",
                    )
                  : null
              }
            />
            <InfoRow
              label="Email & phone consent accepted at"
              value={
                data.lead.customer?.caslConsentAt
                  ? new Date(data.lead.customer.caslConsentAt).toLocaleString(
                      "en-CA",
                    )
                  : data.lead.contactConsentAt
                    ? new Date(data.lead.contactConsentAt).toLocaleString("en-CA")
                    : null
              }
            />
            <InfoRow label="Win reason" value={data.lead.winReason} />
            <InfoRow label="Lost reason" value={data.lead.lostReason} />
          </DetailColumn>
        </div>

        {data.lead.notes ? (
          <div className="mt-5 border-t border-[#eef2f6] pt-4">
            <h4 className="mb-2 text-[12px] font-bold uppercase tracking-[0.06em] text-[#64748b]">
              Intake notes
            </h4>
            <p className="whitespace-pre-wrap text-[13px] text-[#334155]">
              {data.lead.notes}
            </p>
          </div>
        ) : null}
      </div>

      {data.lead.utmSource || data.lead.utmCampaign || data.lead.adCampaign ? (
        <section className="rounded-lg border border-[#e2e8f0] bg-white px-4 py-3">
          <h3 className="mb-3 text-[13px] font-bold text-[#1e2a38]">
            Attribution
          </h3>
          <dl className="grid gap-2 text-[13px] sm:grid-cols-3">
            <div>
              <dt className="text-[#94a3b8]">Campaign</dt>
              <dd className="font-medium text-[#1e2a38]">
                {data.lead.adCampaign?.name ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[#94a3b8]">utm_source</dt>
              <dd className="font-medium text-[#1e2a38]">
                {data.lead.utmSource ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[#94a3b8]">utm_campaign</dt>
              <dd className="font-medium text-[#1e2a38]">
                {data.lead.utmCampaign ?? "—"}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      <section className="rounded-lg border border-[#e2e8f0] bg-white px-4 py-3">
        <h3 className="mb-3 text-[13px] font-bold text-[#1e2a38]">
          Partner handoff
        </h3>
        <HandoffClient leadId={data.lead.id} />
      </section>
    </>
  );
}
