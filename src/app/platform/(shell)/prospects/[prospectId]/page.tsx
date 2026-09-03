import Link from "next/link";
import { notFound } from "next/navigation";
import { PlatformDetailGrid } from "@/components/platform/PlatformDetailGrid";
import { PlatformProspectActions } from "@/components/platform/PlatformProspectActions";
import {
  PlatformBadge,
  PlatformErrorState,
  PlatformPageHeader,
  PlatformPanel,
  PlatformTableWrap,
} from "@/components/platform/PlatformUi";
import {
  getPlatformProspect,
  PlatformApiClientError,
} from "@/lib/platform/ui/api-client";
import { formatPlatformDate, titleCaseStatus } from "@/lib/platform/ui/format";
import { platformStatusTone } from "@/lib/platform/ui/status-tone";

type PageProps = {
  params: Promise<{ prospectId: string }>;
};

type JsonRecord = Record<string, unknown>;

function asArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? (value as JsonRecord[]) : [];
}

function str(value: unknown): string {
  if (value == null || value === "") return "—";
  return String(value);
}

function rawStr(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

function activityTitle(type: string): string {
  switch (type) {
    case "NOTE":
      return "Internal note";
    case "STATUS_CHANGE":
      return "Status change";
    case "DEMO_SCHEDULED":
      return "Demo scheduled";
    case "DEMO_COMPLETED":
      return "Demo completed";
    case "DEMO_NO_SHOW":
      return "Demo no-show";
    case "DEMO_CANCELLED":
      return "Demo cancelled";
    case "OFFER_LINKED":
      return "Offer linked";
    default:
      return titleCaseStatus(type);
  }
}

export default async function PlatformProspectDetailPage({ params }: PageProps) {
  const { prospectId } = await params;
  let prospect: JsonRecord | null = null;
  let errorMessage: string | null = null;

  try {
    prospect = (await getPlatformProspect(prospectId)) as JsonRecord;
  } catch (error) {
    if (error instanceof PlatformApiClientError && error.status === 404) {
      notFound();
    }
    errorMessage =
      error instanceof PlatformApiClientError
        ? error.message
        : "Unable to load prospect detail.";
  }

  if (errorMessage) {
    return (
      <>
        <PlatformPageHeader title="Platform prospect" />
        <PlatformErrorState title="Prospect unavailable" message={errorMessage} />
      </>
    );
  }

  if (!prospect) notFound();

  const owner = prospect.ownerOperator as JsonRecord | null;
  const title =
    rawStr(prospect.businessName) ||
    rawStr(prospect.contactName) ||
    "Platform prospect";

  return (
    <>
      <PlatformPageHeader
        title={title}
        description="Platform sales prospect — distinct from tenant CRM leads."
      >
        <Link
          href={`/platform/offers/new?prospectId=${encodeURIComponent(rawStr(prospect.id))}`}
          className="inline-flex rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
        >
          Create Offer
        </Link>
      </PlatformPageHeader>

      <div className="space-y-6">
        <PlatformProspectActions
          prospectId={rawStr(prospect.id)}
          contactName={rawStr(prospect.contactName)}
          email={rawStr(prospect.email)}
          businessName={rawStr(prospect.businessName)}
          phone={rawStr(prospect.phone)}
          brokerageName={rawStr(prospect.brokerageName)}
          estimatedTeamSize={rawStr(prospect.estimatedTeamSize)}
          region={rawStr(prospect.region)}
          website={rawStr(prospect.website)}
          source={rawStr(prospect.source)}
          status={rawStr(prospect.status)}
          notesInternal={rawStr(prospect.notesInternal)}
        />

        <PlatformPanel title="Prospect information">
          <PlatformDetailGrid
            items={[
              { label: "Contact", value: str(prospect.contactName) },
              { label: "Email", value: str(prospect.email) },
              { label: "Phone", value: str(prospect.phone) },
              { label: "Brokerage", value: str(prospect.brokerageName) },
              { label: "Region", value: str(prospect.region) },
              { label: "Website", value: str(prospect.website) },
              {
                label: "Estimated team size",
                value: str(prospect.estimatedTeamSize),
              },
              {
                label: "Status",
                value: (
                  <PlatformBadge tone={platformStatusTone(str(prospect.status))}>
                    {titleCaseStatus(str(prospect.status))}
                  </PlatformBadge>
                ),
              },
              { label: "Source", value: titleCaseStatus(str(prospect.source)) },
              {
                label: "Owner operator",
                value: owner
                  ? `${str(owner.role)} · ${str(owner.status)}`
                  : "Unassigned",
              },
              { label: "Created", value: formatPlatformDate(str(prospect.createdAt)) },
              { label: "Updated", value: formatPlatformDate(str(prospect.updatedAt)) },
            ]}
          />
        </PlatformPanel>

        <PlatformPanel title="Internal sales notes">
          <p className="whitespace-pre-wrap text-sm text-slate-300">
            {str(prospect.notesInternal)}
          </p>
        </PlatformPanel>

        <PlatformPanel title="Activity timeline">
          {asArray(prospect.activities).length === 0 ? (
            <p className="text-sm text-slate-400">No activities recorded.</p>
          ) : (
            <ul className="space-y-3 text-sm">
              {asArray(prospect.activities).map((activity) => (
                <li
                  key={str(activity.id)}
                  className="rounded-lg border border-slate-800 bg-slate-900/40 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <PlatformBadge tone="neutral">
                      {activityTitle(str(activity.type))}
                    </PlatformBadge>
                    <span className="text-xs text-slate-500">
                      {formatPlatformDate(str(activity.createdAt))}
                    </span>
                  </div>
                  {activity.scheduledAt ? (
                    <p className="mt-2 text-xs text-slate-400">
                      Scheduled: {formatPlatformDate(str(activity.scheduledAt))}
                    </p>
                  ) : null}
                  {activity.completedAt ? (
                    <p className="mt-1 text-xs text-slate-400">
                      Completed: {formatPlatformDate(str(activity.completedAt))}
                    </p>
                  ) : null}
                  {activity.body ? (
                    <p className="mt-2 whitespace-pre-wrap text-slate-300">
                      {str(activity.body)}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </PlatformPanel>

        <PlatformPanel title="Linked offers">
          {asArray(prospect.offers).length === 0 ? (
            <p className="text-sm text-slate-400">No offers linked to this prospect.</p>
          ) : (
            <PlatformTableWrap>
              <thead className="bg-slate-900/60 text-left text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-4 py-2">Offer</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Plan</th>
                  <th className="px-4 py-2">Expires</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {asArray(prospect.offers).map((offer) => (
                  <tr key={str(offer.id)}>
                    <td className="px-4 py-2">
                      <Link
                        href={`/platform/offers/${str(offer.id)}`}
                        className="text-emerald-400 hover:text-emerald-300"
                      >
                        {str(offer.id).slice(0, 8)}…
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      <PlatformBadge tone={platformStatusTone(str(offer.status))}>
                        {titleCaseStatus(str(offer.status))}
                      </PlatformBadge>
                    </td>
                    <td className="px-4 py-2 text-slate-300">{str(offer.planCode)}</td>
                    <td className="px-4 py-2 text-slate-400">
                      {formatPlatformDate(str(offer.expiresAt))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </PlatformTableWrap>
          )}
        </PlatformPanel>
      </div>
    </>
  );
}
