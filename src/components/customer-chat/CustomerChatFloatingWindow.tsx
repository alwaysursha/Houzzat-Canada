"use client";

import { useEffect, useState } from "react";
import { useCustomerChatController } from "@/components/customer-chat/CustomerChatProvider";
import { CustomerChatScreen } from "@/components/customer-chat/CustomerChatScreen";
import { ChatAgentAvatar } from "@/components/chat/ChatAgentAvatar";
import {
  CUSTOMER_CHAT_FLOATING_SIZE,
  clampCustomerChatWindowPosition,
  presentCustomerChatAgentInitials,
  presentCustomerChatAgentName,
} from "@/lib/customer-chat/floating-chat";
import { cn } from "@/lib/utils";

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

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
  const reducedMotion = usePrefersReducedMotion();
  const [entered, setEntered] = useState(reducedMotion);

  useEffect(() => {
    if (mode !== "open") {
      setEntered(reducedMotion);
      return;
    }
    if (reducedMotion) {
      setEntered(true);
      return;
    }
    setEntered(false);
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [mode, reducedMotion]);

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
            ? "bottom-[calc(var(--mobile-bottom-nav,0px)+var(--rc-concierge-bar,0px)+5.5rem)] right-4"
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
        <ChatAgentAvatar
          name={presentCustomerChatAgentName(null)}
          initials={presentCustomerChatAgentInitials(null)}
          photoUrl={null}
          size="sm"
          className="ring-1 ring-canopy/20"
        />
        Chat
      </button>
    );
  }

  if (isMobile) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Chat"
        data-customer-chat-floating=""
        className={cn(
          "fixed inset-0 z-[70] flex flex-col bg-gradient-to-b from-[#f7fcf9] via-white to-[#eef8f3] pt-[env(safe-area-inset-top,0px)]",
          !reducedMotion && "transition-transform duration-250 ease-out",
          entered || reducedMotion
            ? "translate-y-0 opacity-100"
            : "translate-y-3 opacity-0",
        )}
        style={
          reducedMotion
            ? undefined
            : { transitionDuration: "260ms" }
        }
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
      aria-label="Chat"
      data-customer-chat-floating=""
      className={cn(
        "fixed z-[60] overflow-hidden rounded-[1.35rem]",
        "border border-canopy/15 bg-gradient-to-b from-white via-[#f8fcfa] to-[#eef8f3]",
        "shadow-[0_22px_60px_rgba(10,77,56,0.22)]",
        !reducedMotion && "origin-bottom-right transition-[opacity,transform] duration-250 ease-out",
        entered || reducedMotion
          ? "scale-100 opacity-100"
          : "scale-95 opacity-0",
      )}
      style={{
        left: position.x,
        top: position.y,
        width: CUSTOMER_CHAT_FLOATING_SIZE.width,
        height: CUSTOMER_CHAT_FLOATING_SIZE.height,
        transitionDuration: reducedMotion ? undefined : "260ms",
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
