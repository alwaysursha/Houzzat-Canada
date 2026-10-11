"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { ListingSection } from "@/components/listings/ListingSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { browserCaptureIntentStore } from "@/components/auth/capture-intent-browser";
import { useOptionalCustomerChatController } from "@/components/customer-chat/CustomerChatProvider";
import { openGuestStartChatIntent } from "@/lib/auth/start-chat-intent";
import {
  normalizeCustomerChatDraft,
  normalizeCustomerChatListingContext,
} from "@/lib/customer-chat/floating-chat";
import { CUSTOMER_CHAT_PAGE_HREF } from "@/lib/customer-chat/query";

export function ListingQaPanel({
  mlsNumber,
  addressLine,
  city,
  title,
  hint,
}: {
  mlsNumber: string;
  addressLine: string;
  city: string;
  title: string;
  hint: string;
  /** @deprecated WhatsApp expert number is unused; kept for call-site compatibility. */
  expertWhatsApp?: string | null;
}) {
  const [question, setQuestion] = useState("");
  const { status } = useSession();
  const { openAuth } = useAuthModal();
  const chat = useOptionalCustomerChatController();

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const listingContext = normalizeCustomerChatListingContext({
      mlsNumber,
      addressLine,
      city,
    });
    if (!listingContext) return;
    const draft = normalizeCustomerChatDraft(question);

    if (status === "authenticated") {
      if (chat) {
        chat.open({
          listingContext,
          draft: draft || null,
          forceExpand: true,
        });
        return;
      }
      window.location.assign(CUSTOMER_CHAT_PAGE_HREF);
      return;
    }

    openGuestStartChatIntent({
      host: window.location.hostname,
      now: Date.now(),
      store: browserCaptureIntentStore(),
      openAuth,
      listingContext,
      draftMessage: draft || null,
    });
  }

  return (
    <ListingSection
      id="listing-ask"
      title={title || "Quick question?"}
      hint={hint}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder="Ask anything about this home…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          aria-label="Your question for the expert"
          className="bg-mist/40"
        />
        <Button type="submit" className="shrink-0 sm:min-w-[10.5rem]">
          Chat with your agent
        </Button>
      </form>
    </ListingSection>
  );
}
