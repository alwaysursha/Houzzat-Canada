"use client";

import { useEffect, useState } from "react";
import { ROYAL_COLLECTION_PREVIEW_ACTION_NOTE } from "./preview-action-note";

function isElement(target: EventTarget | null): target is Element {
  return target instanceof Element;
}

function isAllowed(target: Element): boolean {
  if (target.closest("[data-owner-preview-bar], [data-rc-allow]")) return true;
  if (target.closest("[aria-label='Scroll to top']")) return true;
  const anchor = target.closest("a");
  if (!anchor) return false;
  const href = anchor.getAttribute("href") ?? "";
  return (
    href.startsWith("#") ||
    href.startsWith("/#") ||
    href.startsWith("tel:") ||
    href.startsWith("mailto:")
  );
}

function isOperationalControl(target: Element): boolean {
  return Boolean(
    target.closest(
      "a[href], form, button, input, textarea, select, [role='button'], [role='combobox']",
    ),
  );
}

/**
 * Mounted only for the development display fixture.
 * Shared Houzzat controls stay in the page, but cannot submit or navigate.
 */
export function RoyalCollectionPreviewGuard() {
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let timer = 0;
    const block = (event: Event) => {
      const target = event.target;
      if (!isElement(target) || isAllowed(target) || !isOperationalControl(target)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setNotice(ROYAL_COLLECTION_PREVIEW_ACTION_NOTE);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setNotice(null), 2400);
    };
    document.addEventListener("click", block, true);
    document.addEventListener("auxclick", block, true);
    document.addEventListener("submit", block, true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("click", block, true);
      document.removeEventListener("auxclick", block, true);
      document.removeEventListener("submit", block, true);
    };
  }, []);

  return (
    <p
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        left: "1rem",
        right: "1rem",
        bottom: "calc(var(--mobile-bottom-nav, 0px) + 1rem)",
        zIndex: 70,
        margin: "0 auto",
        maxWidth: "28rem",
        padding: notice ? "0.8rem 1rem" : 0,
        background: notice ? "#071629" : "transparent",
        color: "#C8A66A",
        border: notice ? "1px solid #C8A66A" : "0",
        fontSize: "0.72rem",
        fontWeight: 700,
        letterSpacing: "0.12em",
        textAlign: "center",
        textTransform: "uppercase",
        pointerEvents: "none",
      }}
    >
      {notice}
    </p>
  );
}
