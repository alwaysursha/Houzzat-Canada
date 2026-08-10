/** Previous path for Capacitor Android Back (full document load, not soft RSC). */

const KEY = "houzzat:nav-back";

export function rememberNavBackFrom(href?: string) {
  if (typeof window === "undefined") return;
  const from =
    href ??
    `${window.location.pathname}${window.location.search}${window.location.hash}`;
  try {
    sessionStorage.setItem(KEY, from);
  } catch {
    // ignore
  }
}

export function takeNavBackHref(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const prev = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return prev;
  } catch {
    return null;
  }
}

/** Capacitor-safe document navigation (never reassign Location methods). */
export function hardGo(href: string) {
  window.location.href = href;
}
