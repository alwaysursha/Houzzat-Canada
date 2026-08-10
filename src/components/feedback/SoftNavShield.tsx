"use client";

import { useEffect } from "react";

/**
 * OpenNext/Cloudflare returns 500 for soft RSC when the client sends
 * `Next-Router-State-Tree`. Plain RSC (no tree) returns 200.
 *
 * Only strips that header — no reload storms, no Location patching.
 * That is what breaks click→listing and Back→home after a full page load
 * (Next still soft-handles popstate).
 */
function stripRouterStateTree(
  input: RequestInfo | URL,
  init?: RequestInit,
): { input: RequestInfo | URL; init?: RequestInit } {
  const base =
    init?.headers ?? (input instanceof Request ? input.headers : undefined);
  const headers = new Headers(base);
  if (
    !headers.has("Next-Router-State-Tree") &&
    !headers.has("next-router-state-tree")
  ) {
    return { input, init };
  }
  headers.delete("Next-Router-State-Tree");
  headers.delete("next-router-state-tree");

  if (input instanceof Request) {
    return { input: new Request(input, { ...init, headers }), init: undefined };
  }
  return { input, init: { ...init, headers } };
}

function isRsc(init?: RequestInit, input?: RequestInfo | URL): boolean {
  const h = new Headers(init?.headers ?? undefined);
  if (h.get("RSC") === "1" || h.get("rsc") === "1") return true;
  if (input instanceof Request) {
    return input.headers.get("RSC") === "1" || input.headers.get("rsc") === "1";
  }
  return false;
}

export function SoftNavShield() {
  useEffect(() => {
    const original = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      if (!isRsc(init, input)) return original(input, init);
      const prepared = stripRouterStateTree(input, init);
      return original(prepared.input, prepared.init);
    };
    return () => {
      window.fetch = original;
    };
  }, []);

  return null;
}
