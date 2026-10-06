import Link from "next/link";
import { redirect } from "next/navigation";
import { ApplyHomepageSearchButton } from "@/components/account/ApplyHomepageSearchButton";
import { DeleteSavedSearchButton } from "@/components/account/DeleteSavedSearchButton";
import { SavedSearchEmailAlertsToggle } from "@/components/account/SavedSearchEmailAlertsToggle";
import { requireCustomerUser } from "@/lib/account";
import { GLOBAL_EMAIL_PAUSED_BANNER } from "@/lib/account/entity-alert-mutations";
import {
  parseHomepagePersonalizationQuery,
  personalizationToSearchHref,
  summarizePersonalization,
} from "@/lib/listings/homepage-personalization";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Saved searches" };

function queryToHref(query: unknown) {
  const personalized = parseHomepagePersonalizationQuery(query);
  if (
    personalized.city ||
    personalized.cities?.length ||
    personalized.communities?.length ||
    personalized.minPrice ||
    personalized.maxPrice ||
    personalized.propertyTypes?.length
  ) {
    return personalizationToSearchHref(personalized);
  }
  if (!query || typeof query !== "object") return "/search";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
    if (value == null || value === "") continue;
    if (Array.isArray(value)) {
      if (key === "communities" || key === "cities") {
        params.set(key, value.join("|"));
      } else if (key === "propertyTypes") {
        params.set(key, value.join(","));
      } else {
        params.set(key, String(value[0] ?? ""));
      }
      continue;
    }
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `/search?${qs}` : "/search";
}

export default async function SavedSearchesPage() {
  const user = await requireCustomerUser();
  if (!user) redirect("/auth/sign-in?callbackUrl=/account/searches");

  const searches = await prisma.savedSearch.findMany({
    where: { userId: user.id },
    orderBy: [
      { isPrimary: "desc" },
      { isHomepageActive: "desc" },
      { createdAt: "desc" },
    ],
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl text-ink">Saved searches</h1>
        <p className="mt-2 text-sm text-ink/60">
          Your latest applied search is primary for property alerts. Earlier
          searches are kept as secondary. You can also apply one to your
          homepage rails.
        </p>
      </div>

      {!user.emailAlertsEnabled ? (
        <div
          role="status"
          className="rounded-xl border border-signal/30 bg-signal/[0.08] px-4 py-3 text-sm text-ink/80"
        >
          {GLOBAL_EMAIL_PAUSED_BANNER}{" "}
          <Link
            href="/preferences/email"
            className="font-semibold text-canopy underline-offset-2 hover:underline"
          >
            Communication Preferences
          </Link>
        </div>
      ) : null}

      <ul className="space-y-3">
        {searches.map((search) => {
          const hint =
            summarizePersonalization(
              parseHomepagePersonalizationQuery(search.query),
            ) || null;
          return (
            <li
              key={search.id}
              className="space-y-3 rounded-2xl border border-line bg-surface p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-ink">{search.name}</p>
                    {search.isPrimary ? (
                      <span className="rounded-md bg-canopy/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-canopy-deep">
                        Primary
                      </span>
                    ) : (
                      <span className="rounded-md bg-mist px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-ink/45">
                        Secondary
                      </span>
                    )}
                    {search.isHomepageActive ? (
                      <span className="rounded-md bg-signal/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-signal">
                        On homepage
                      </span>
                    ) : null}
                  </div>
                  {hint ? (
                    <p className="mt-1 text-xs text-ink/50">{hint}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <ApplyHomepageSearchButton
                    id={search.id}
                    active={search.isHomepageActive}
                  />
                  <Link
                    href={queryToHref(search.query)}
                    className="rounded-lg border border-line bg-mist px-3 py-2 text-sm font-semibold text-ink/80"
                  >
                    Open
                  </Link>
                  <DeleteSavedSearchButton id={search.id} />
                </div>
              </div>
              <SavedSearchEmailAlertsToggle
                id={search.id}
                initialEmailAlerts={search.emailAlerts}
                isPrimary={search.isPrimary}
              />
            </li>
          );
        })}
      </ul>

      {searches.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center text-sm text-ink/55">
          No saved searches yet. Use{" "}
          <Link href="/" className="text-canopy">
            Create Custom Search
          </Link>{" "}
          on the homepage, or save a search from{" "}
          <Link href="/search" className="text-canopy">
            Search
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}
