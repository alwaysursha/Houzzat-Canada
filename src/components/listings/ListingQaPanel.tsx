"use client";

import { useState } from "react";
import { ListingSection } from "@/components/listings/ListingSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useExpertWhatsAppNumber } from "@/components/whatsapp/useExpertWhatsAppNumber";
import { buildListingExpertWhatsAppUrl, WHATSAPP_UNAVAILABLE_COPY } from "@/lib/whatsapp";

export function ListingQaPanel({
  mlsNumber,
  addressLine,
  city,
  title,
  hint,
  expertWhatsApp = null,
}: {
  mlsNumber: string;
  addressLine: string;
  city: string;
  title: string;
  hint: string;
  expertWhatsApp?: string | null;
}) {
  const [question, setQuestion] = useState("");
  const { digits: phoneDigits, ready } = useExpertWhatsAppNumber(expertWhatsApp);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!phoneDigits) return;

    const url = buildListingExpertWhatsAppUrl({
      phoneDigits,
      mlsNumber,
      addressLine,
      city,
      question,
    });
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <ListingSection
      id="listing-ask"
      title={title || "Quick question?"}
      hint={hint}
    >
      {!ready ? (
        <p className="text-sm text-ink/50">Loading WhatsApp…</p>
      ) : !phoneDigits ? (
        <p className="rounded-xl border border-line bg-mist/60 px-4 py-3 text-sm text-ink/75">
          {WHATSAPP_UNAVAILABLE_COPY}
        </p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="Ask anything about this home…"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            aria-label="Your question for the expert"
            className="bg-mist/40"
          />
          <Button type="submit" className="shrink-0 sm:min-w-[10.5rem]">
            Message on WhatsApp
          </Button>
        </form>
      )}
    </ListingSection>
  );
}
