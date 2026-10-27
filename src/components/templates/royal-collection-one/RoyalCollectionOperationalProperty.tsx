import type { ViewingContactDefaults } from "@/components/listings/ViewingBookingModal";
import { ListingAccessGate } from "@/components/listings/ListingAccessGate";
import { ViewingRequestPanel } from "@/components/listings/ViewingRequestPanel";
import { HIGH_OCTANE_DEMO_PROPERTY_NOTICE } from "@/lib/tenancy/templates/high-octane-public-showcase";
import { RoyalCollectionPropertyView } from "./RoyalCollectionPropertyView";
import type { RoyalCollectionPropertyModel } from "@/lib/tenancy/templates/royal-collection-property-model";
import styles from "./royal-property.module.css";

export type RoyalCollectionViewingAction = {
  mlsNumber: string;
  callbackPath: string;
  inactive: boolean;
  city: string;
  community: string | null;
  transactionType: "SALE" | "LEASE";
  segment?: string;
  signedIn: boolean;
  contact?: ViewingContactDefaults;
};

/**
 * Operational Royal Collection property page.
 * The model is already authorized and redacted by the listing route.
 */
export function RoyalCollectionOperationalProperty({
  model,
  signedIn,
  mlsNumber,
  canonicalPath,
  viewing,
}: {
  model: RoyalCollectionPropertyModel;
  signedIn: boolean;
  mlsNumber: string;
  canonicalPath: string;
  viewing: RoyalCollectionViewingAction | null;
}) {
  const demonstration = Boolean(model.badge);
  const page = (
    <RoyalCollectionPropertyView
      model={model}
      showDisclaimer={model.kind === "listing" && !demonstration}
      notice={
        demonstration ? (
          <p className={styles.demoNotice}>{HIGH_OCTANE_DEMO_PROPERTY_NOTICE}</p>
        ) : null
      }
    >
      {demonstration ? (
        <p className={styles.demoNotice}>{HIGH_OCTANE_DEMO_PROPERTY_NOTICE}</p>
      ) : viewing ? (
        <div className={styles.listingActions}>
          <ViewingRequestPanel
            mlsNumber={viewing.mlsNumber}
            callbackPath={viewing.callbackPath}
            inactive={viewing.inactive}
            city={viewing.city}
            community={viewing.community}
            transactionType={viewing.transactionType}
            segment={viewing.segment}
            signedIn={viewing.signedIn}
            contact={viewing.contact}
            appearance="royal"
          />
        </div>
      ) : (
        <p className={styles.asideFine}>
          Sign in to request a viewing. This page does not send an inquiry.
        </p>
      )}
    </RoyalCollectionPropertyView>
  );

  if (signedIn || demonstration) return page;
  return (
    <ListingAccessGate mlsNumber={mlsNumber} callbackPath={canonicalPath} signedIn={false}>
      {page}
    </ListingAccessGate>
  );
}
