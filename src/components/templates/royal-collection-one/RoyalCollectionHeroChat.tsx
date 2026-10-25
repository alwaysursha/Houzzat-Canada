"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { MessageCircle } from "lucide-react";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { browserCaptureIntentStore } from "@/components/auth/capture-intent-browser";
import { useOptionalCustomerChatController } from "@/components/customer-chat/CustomerChatProvider";
import { openGuestStartChatIntent } from "@/lib/auth/start-chat-intent";
import { CUSTOMER_CHAT_PAGE_HREF } from "@/lib/customer-chat/query";
import { resolveAppShell } from "@/lib/mobile/app-shell";
import styles from "./royal-collection.module.css";

/** Chat control that sits with the hero scroll link. The floating entry stays on other pages. */
export function RoyalCollectionHeroChat() {
  const { status, data } = useSession();
  const { openAuth } = useAuthModal();
  const chat = useOptionalCustomerChatController();
  const role = data?.user?.role;
  const [houzzatProShell, setHouzzatProShell] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void resolveAppShell().then((shell) => {
      if (!cancelled) setHouzzatProShell(shell === "houzzatpro");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const isStaff =
    status === "authenticated" && (role === "ADMIN" || role === "AGENT");

  if (houzzatProShell || isStaff) return null;
  if (status === "loading") return null;
  if (status === "authenticated" && chat?.mode === "open") return null;

  return (
    <button
      type="button"
      className={styles.heroChat}
      aria-label="Open chat"
      data-customer-chat-entry=""
      onClick={() => {
        if (status === "authenticated") {
          if (chat) {
            chat.open({ forceExpand: true });
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
        });
      }}
    >
      Chat
      <MessageCircle strokeWidth={1.75} aria-hidden />
    </button>
  );
}
