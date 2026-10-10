"use client";

import { useEffect } from "react";
import { useCustomerChatController } from "@/components/customer-chat/CustomerChatProvider";
import { CustomerChatScreen } from "@/components/customer-chat/CustomerChatScreen";
import {
  CUSTOMER_CHAT_FLOATING_SIZE,
  clampCustomerChatWindowPosition,
  presentCustomerChatAgentInitials,
} from "@/lib/customer-chat/floating-chat";
import { cn } from "@/lib/utils";

export function CustomerChatFloatingWindow() {
  const {
    mode,
    draft,
    listingContext,
    position,
    isMobile,
    minimize,
    expand,
    close,
    setDraft,
    setPosition,
  } = useCustomerChatController();

  useEffect(() => {
    if (mode !== "open" || isMobile) return;
    function onResize() {
      setPosition(
        clampCustomerChatWindowPosition(position, {
          width: window.innerWidth,
          height: window.innerHeight,
        }),
      );
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [isMobile, mode, position, setPosition]);

  if (mode === "minimized") {
    return (
      <button
        type="button"
        onClick={expand}
        aria-label="Expand chat"
        data-customer-chat-floating=""
        className={cn(
          "fixed z-[60] inline-flex items-center gap-2 rounded-full border border-canopy/25",
          "bg-gradient-to-r from-white via-[#f3fbf7] to-[#e7f6ef] px-4 py-2.5",
          "text-sm font-semibold text-canopy-deep shadow-[0_10px_30px_rgba(15,107,76,0.18)]",
          "transition hover:border-canopy/40",
          isMobile
            ? "bottom-[calc(var(--mobile-bottom-nav,0px)+5.5rem)] right-4"
            : null,
        )}
        style={
          isMobile
            ? undefined
            : {
                left: position.x,
                top: position.y + CUSTOMER_CHAT_FLOATING_SIZE.height - 52,
              }
        }
      >
        <span className="inline-flex size-7 items-center justify-center rounded-full bg-canopy text-[11px] font-bold text-white">
          {presentCustomerChatAgentInitials(null)}
        </span>
        Chat
      </button>
    );
  }

  if (isMobile) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Chat with your agent"
        data-customer-chat-floating=""
        className="fixed inset-0 z-[70] flex flex-col bg-gradient-to-b from-[#f7fcf9] via-white to-[#eef8f3] pt-[env(safe-area-inset-top,0px)]"
      >
        <CustomerChatScreen
          chrome="mobile-sheet"
          draft={draft}
          onDraftChange={setDraft}
          listingContext={listingContext}
          onClose={close}
          chatVisible
        />
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="Chat with your agent"
      data-customer-chat-floating=""
      className={cn(
        "fixed z-[60] overflow-hidden rounded-[1.35rem]",
        "border border-canopy/15 bg-gradient-to-b from-white via-[#f8fcfa] to-[#eef8f3]",
        "shadow-[0_22px_60px_rgba(10,77,56,0.22)]",
      )}
      style={{
        left: position.x,
        top: position.y,
        width: CUSTOMER_CHAT_FLOATING_SIZE.width,
        height: CUSTOMER_CHAT_FLOATING_SIZE.height,
      }}
    >
      <CustomerChatScreen
        chrome="floating"
        draft={draft}
        onDraftChange={setDraft}
        listingContext={listingContext}
        onClose={close}
        onMinimize={minimize}
        chatVisible
        position={position}
        onPositionChange={setPosition}
      />
    </div>
  );
}
