"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useExpertWhatsAppNumber } from "@/components/whatsapp/useExpertWhatsAppNumber";
import { buildListingExpertWhatsAppUrl } from "@/lib/whatsapp";

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
    <section className="space-y-3 rounded-2xl border border-line bg-surface p-5">
      <div>
        <h2 className="font-display text-2xl text-ink">{title}</h2>
        <p className="mt-1 text-xs text-ink/50">{hint}</p>
      </div>

      {!ready ? (
        <p className="text-sm text-ink/50">Loading WhatsApp…</p>
      ) : !phoneDigits ? (
        <p className="rounded-xl border border-amber/30 bg-amber/5 px-4 py-3 text-sm text-ink/75">
          WhatsApp expert number is not configured yet. Set{" "}
          <code className="text-xs">NEXT_PUBLIC_WHATSAPP_EXPERT</code> in{" "}
          <code className="text-xs">.env.local</code> (e.g.{" "}
          <code className="text-xs">14165550100</code>), then restart the
          server.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="Ask anything about this home…"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            aria-label="Your question for the expert"
          />
          <Button type="submit" className="shrink-0 sm:min-w-[10.5rem]">
            Message on WhatsApp
          </Button>
        </form>
      )}
    </section>
  );
}
