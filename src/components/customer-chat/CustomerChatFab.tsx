"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { MessageCircle } from "lucide-react";
import { AuthOpenButton } from "@/components/auth/AuthOpenButton";
import { CUSTOMER_CHAT_PAGE_HREF } from "@/lib/customer-chat/query";
import { resolveAppShell } from "@/lib/mobile/app-shell";
import { cn } from "@/lib/utils";

/**
 * Modest persistent Chat entry on tenant customer websites.
 * Marketing/account chrome already fail-closes non-tenant hosts.
 * Hidden on Agent InstantShell, Pro native, staff sessions, and the Chat page.
 */
export function CustomerChatFab() {
  const pathname = usePathname() || "/";
  const { status, data } = useSession();
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
    status === "authenticated" &&
    (role === "ADMIN" || role === "AGENT");
  const onChatPage =
    pathname === CUSTOMER_CHAT_PAGE_HREF ||
    pathname.startsWith(`${CUSTOMER_CHAT_PAGE_HREF}/`);
  const onPro = pathname === "/pro" || pathname.startsWith("/pro/");

  if (houzzatProShell || isStaff || onChatPage || onPro) return null;
  if (status === "loading") return null;

  const aboveListingBar = pathname.startsWith("/listing/");
  const className = cn(
    "fixed right-4 z-[45] inline-flex items-center justify-center gap-2",
    "rounded-full border border-canopy/20 bg-canopy text-white shadow-md",
    "hover:bg-canopy-deep focus-visible:outline-none focus-visible:ring-2",
    "focus-visible:ring-canopy/40 focus-visible:ring-offset-2 focus-visible:ring-offset-mist",
    "size-11 sm:h-11 sm:w-auto sm:px-3.5",
    "sm:right-6",
    aboveListingBar
      ? "bottom-[calc(var(--mobile-bottom-nav,0px)+8.5rem)] md:bottom-24"
      : "bottom-[calc(var(--mobile-bottom-nav,0px)+4.75rem)] md:bottom-20",
  );

  const inner = (
    <>
      <MessageCircle className="size-5" strokeWidth={2.15} aria-hidden />
      <span className="hidden text-sm font-semibold sm:inline">Chat</span>
    </>
  );

  if (status === "authenticated") {
    return (
      <a
        href={CUSTOMER_CHAT_PAGE_HREF}
        aria-label="Chat with your agent"
        data-customer-chat-entry=""
        className={className}
      >
        {inner}
      </a>
    );
  }

  return (
    <AuthOpenButton
      mode="sign-in"
      callbackUrl={CUSTOMER_CHAT_PAGE_HREF}
      aria-label="Chat with your agent"
      data-customer-chat-entry=""
      className={className}
    >
      {inner}
    </AuthOpenButton>
  );
}
