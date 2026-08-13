"use client";

import type { ComponentProps, MouseEvent } from "react";
import { hardGo, rememberNavBackFrom } from "@/lib/mobile/nav-back";

/**
 * Full-document navigation across staff layout boundaries
 * (admin ↔ agent ↔ account ↔ marketing). Avoids soft RSC into
 * force-dynamic shells — Capacitor-safe like account hard links.
 */
export function staffHardNavigate(
  href: string,
  options?: { rememberFrom?: boolean },
) {
  if (options?.rememberFrom !== false) {
    rememberNavBackFrom();
  }
  hardGo(href);
}

type StaffHardLinkProps = Omit<ComponentProps<"a">, "href"> & {
  href: string;
  /** Remember current URL for Capacitor Back (default true). */
  rememberFrom?: boolean;
};

export function StaffHardLink({
  href,
  rememberFrom = true,
  onClick,
  children,
  ...props
}: StaffHardLinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented) return;
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return;
    }
    event.preventDefault();
    staffHardNavigate(href, { rememberFrom });
  }

  return (
    <a href={href} onClick={handleClick} {...props}>
      {children}
    </a>
  );
}

/** True when href leaves the current staff section for another layout. */
export function isStaffCrossLayoutHref(
  href: string,
  section: "admin" | "agent",
): boolean {
  try {
    const path = href.startsWith("http")
      ? new URL(href).pathname
      : (href.split("?")[0] ?? "");
    if (section === "admin") {
      return !path.startsWith("/admin");
    }
    return !path.startsWith("/agent");
  } catch {
    return true;
  }
}
