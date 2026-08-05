"use client";

import { ExpandableDescription } from "@/components/listings/ExpandableDescription";
import { ListingSection } from "@/components/listings/ListingSection";
import { stripApproxPinNote } from "@/lib/listings/facts";

export function ListingNarrative({ body }: { body: string }) {
  const cleaned = stripApproxPinNote(body);
  return (
    <ListingSection
      id="listing-about"
      eyebrow="About this home"
      title="Listing description"
      hint="Broker remarks from the listing."
    >
      <ExpandableDescription text={cleaned} className="text-ink/75" />
    </ListingSection>
  );
}
