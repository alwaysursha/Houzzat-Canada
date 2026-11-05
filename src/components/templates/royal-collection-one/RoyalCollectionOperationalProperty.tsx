import type { ViewingContactDefaults } from "@/components/listings/ViewingBookingModal";
import { ListingAccessGate } from "@/components/listings/ListingAccessGate";
import { ViewingRequestPanel } from "@/components/listings/ViewingRequestPanel";
import {
  RoyalCollectionPropertyActions,
  type RoyalCollectionPropertyEngagement,
} from "./RoyalCollectionPropertyActions";
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
  engagement,
  publicShowcase = false,
  sheet = false,
}: {
  model: RoyalCollectionPropertyModel;
  signedIn: boolean;
  mlsNumber: string;
  canonicalPath: string;
  viewing: RoyalCollectionViewingAction | null;
  engagement?: RoyalCollectionPropertyEngagement | null;
  /** Public synthetic inventory stays readable without a sign-in wall. */
  publicShowcase?: boolean;
  /** Listing overlay iframe. The site header is not in this frame. */
  sheet?: boolean;
}) {
  const page = (
    <RoyalCollectionPropertyView
      model={model}
      showDisclaimer={model.kind === "listing"}
      sheet={sheet}
      actions={
        engagement && model.kind === "listing" ? (
          <RoyalCollectionPropertyActions engagement={engagement} />
        ) : null
      }
    >
      {viewing ? (
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

  if (signedIn || publicShowcase) return page;
  return (
    <ListingAccessGate mlsNumber={mlsNumber} callbackPath={canonicalPath} signedIn={false}>
      {page}
    </ListingAccessGate>
  );
}
