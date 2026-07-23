"use client";

import { ExpandableDescription } from "@/components/listings/ExpandableDescription";

export function ListingNarrative({ body }: { body: string }) {
  return (
    <section className="space-y-2 rounded-2xl border border-line bg-surface p-5">
      <h2 className="font-display text-2xl text-ink">Listing Description</h2>
      <ExpandableDescription text={body} className="text-ink/75" />
    </section>
  );
}
