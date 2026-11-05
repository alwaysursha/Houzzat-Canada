"use client";

import type { ReactNode } from "react";
import { Bell, Heart, MapPin } from "lucide-react";
import { SaveListingButton } from "@/components/account/SaveListingButton";
import { WatchAreaButton } from "@/components/account/WatchAreaButton";
import { WatchListingButton } from "@/components/account/WatchListingButton";
import { ShareListingButton } from "@/components/listings/ShareListingButton";
import { HIGH_OCTANE_DEMO_PROPERTY_NOTICE } from "@/lib/tenancy/templates/high-octane-public-showcase";
import styles from "./royal-property.module.css";

export type RoyalCollectionPropertyEngagement = {
  mlsNumber: string;
  path: string;
  title: string;
  city: string;
  community: string | null;
  transactionType: "SALE" | "LEASE";
  segment?: string | null;
  inactive: boolean;
  demonstration: boolean;
  signedIn: boolean;
};

function watchSegment(
  segment: string | null | undefined,
): "RESIDENTIAL" | "COMMERCIAL" {
  return segment === "COMMERCIAL" ? "COMMERCIAL" : "RESIDENTIAL";
}

function UnavailableAction({
  label,
  icon,
}: {
  label: string;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      className={styles.actionButton}
      disabled
      aria-describedby="rc-demo-actions-note"
    >
      {icon}
      {label}
    </button>
  );
}

/**
 * Royal Collection property toolbar.
 * Real listings use the existing save, watch, and share controls.
 * Demonstration listings keep share and do not start watches or saves.
 */
export function RoyalCollectionPropertyActions({
  engagement,
}: {
  engagement: RoyalCollectionPropertyEngagement;
}) {
  const segment = watchSegment(engagement.segment);
  if (engagement.demonstration) {
    return (
      <div className={styles.propertyActions}>
        <ShareListingButton
          mlsNumber={engagement.mlsNumber}
          title={engagement.title}
          path={engagement.path}
          appearance="royal"
        />
        <UnavailableAction label="Save listing" icon={<Heart className="h-4 w-4" aria-hidden />} />
        <UnavailableAction label="Watch property" icon={<Bell className="h-4 w-4" aria-hidden />} />
        <UnavailableAction label="Watch area" icon={<MapPin className="h-4 w-4" aria-hidden />} />
        <p id="rc-demo-actions-note" className={styles.actionNote}>
          {HIGH_OCTANE_DEMO_PROPERTY_NOTICE} Save, property watch, and area watch stay off until this is a live listing.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.propertyActions}>
      <ShareListingButton
        mlsNumber={engagement.mlsNumber}
        title={engagement.title}
        path={engagement.path}
        appearance="royal"
      />
      <SaveListingButton
        mlsNumber={engagement.mlsNumber}
        initiallySaved={false}
        signedIn={engagement.signedIn}
        authCallbackUrl={engagement.path}
        appearance="royal"
      />
      {engagement.inactive ? null : (
        <WatchListingButton
          mlsNumber={engagement.mlsNumber}
          initiallyWatching={false}
          signedIn={engagement.signedIn}
          idleLabel="Watch property"
          activeLabel="Watching"
          authCallbackUrl={engagement.path}
          appearance="royal"
        />
      )}
      {engagement.city.trim() ? (
        <WatchAreaButton
          city={engagement.city}
          community={engagement.community ?? undefined}
          transactionType={engagement.transactionType}
          segment={segment}
          signedIn={engagement.signedIn}
          idleLabel="Watch area"
          activeLabel="Area watched"
          authCallbackUrl={engagement.path}
          appearance="royal"
        />
      ) : null}
    </div>
  );
}
