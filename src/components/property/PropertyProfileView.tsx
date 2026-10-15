import Link from "next/link";
import { MapPin } from "lucide-react";
import { ClaimPropertyAddressButton } from "@/components/property/ClaimPropertyAddressButton";
import { NeighbourhoodInsightsCard } from "@/components/property/NeighbourhoodInsightsCard";
import { PropertyHomeValuationCta } from "@/components/property/PropertyHomeValuationCta";
import { PropertyLocationMap } from "@/components/property/PropertyLocationMap";
import type { PropertyProfileModel } from "@/lib/property-address/load-property-profile";
import { MlsDisclaimer } from "@/components/compliance/MlsDisclaimer";

export function PropertyProfileView({
  profile,
  brandName,
}: {
  profile: PropertyProfileModel;
  brandName: string;
}) {
  const { address } = profile;
  const streetLine = [address.streetNumber, address.streetName]
    .filter(Boolean)
    .join(" ");
  const title =
    address.unitNumber && streetLine
      ? `${streetLine} Unit ${address.unitNumber}`
      : streetLine || address.formattedAddress;
  const locality = [address.city, address.province, address.postalCode]
    .filter(Boolean)
    .join(", ");

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="relative overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-mist via-surface to-canopy/10">
        <div className="flex min-h-[12rem] flex-col items-center justify-center gap-3 px-6 py-10 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-canopy/15 text-canopy">
            <MapPin className="size-7" aria-hidden />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-canopy/80">
            {brandName}
          </p>
          <p className="max-w-sm text-sm text-ink/55">
            Property preview — no listing photos available for this address.
          </p>
        </div>
      </div>

      <header className="mt-8 space-y-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          {title}
        </h1>
        {locality ? (
          <p className="text-base text-ink/60">{locality}</p>
        ) : null}
      </header>

      <section
        className="mt-6 rounded-xl border border-line bg-surface px-4 py-4 sm:px-5"
        aria-labelledby="property-status-heading"
      >
        <h2
          id="property-status-heading"
          className="text-sm font-semibold text-ink"
        >
          {profile.statusHeadline}
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-ink/65">
          {profile.statusDetail}
        </p>
      </section>

      {address.lat != null && address.lng != null ? (
        <section className="mt-6" aria-label="Location map">
          <PropertyLocationMap
            lat={address.lat}
            lng={address.lng}
            label={title}
          />
        </section>
      ) : null}

      <NeighbourhoodInsightsCard insights={profile.neighbourhood} />

      <PropertyHomeValuationCta href={profile.homeValuationHref} />

      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <ClaimPropertyAddressButton
          context={{
            formattedAddress: address.formattedAddress,
            unitNumber: address.unitNumber,
            lat: address.lat,
            lng: address.lng,
            placeId: address.placeId,
            city: address.city,
            province: address.province,
            propertyPath: profile.canonicalPath,
            savedAt: new Date().toISOString(),
          }}
        />
        {profile.nearbyHref ? (
          <Link
            href={profile.nearbyHref}
            className="inline-flex items-center justify-center rounded-lg border border-line bg-surface px-5 py-3 text-sm font-semibold text-ink transition hover:border-canopy/40 hover:text-canopy"
          >
            Search Nearby Homes
          </Link>
        ) : null}
      </div>

      <div className="mt-10">
        <MlsDisclaimer compact />
      </div>
    </main>
  );
}
