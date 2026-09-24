"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import type {
  ClientAccessKind,
  ResolvedClientAccess,
} from "@/lib/account-access";
import { EMAIL_VERIFIED_EVENT } from "@/lib/auth/verification-success-signal";

export type ClientAccessState = ResolvedClientAccess & {
  email: string | null;
  loading: boolean;
};

const VISITOR: ClientAccessState = {
  kind: "visitor",
  isSignedIn: false,
  hasClientAccess: false,
  needsEmailVerification: false,
  email: null,
  loading: true,
};

function accessFromJson(data: unknown): ClientAccessState {
  const json = data as {
    kind?: ClientAccessKind;
    isSignedIn?: boolean;
    hasClientAccess?: boolean;
    needsEmailVerification?: boolean;
    email?: string | null;
  };
  return {
    kind: json.kind ?? "visitor",
    isSignedIn: Boolean(json.isSignedIn),
    hasClientAccess: Boolean(json.hasClientAccess),
    needsEmailVerification: Boolean(json.needsEmailVerification),
    email: json.email ?? null,
    loading: false,
  };
}

/**
 * Site-wide client access for gates.
 * Prefer this over `useSession() === "authenticated"` for sold/VOW locks.
 * Authority is always live `/api/account/access` (DB), never JWT emailVerified.
 */
export function useClientAccess(): ClientAccessState {
  const { status } = useSession();
  const [state, setState] = useState<ClientAccessState>(VISITOR);

  useEffect(() => {
    if (status === "loading") {
      setState((prev) => ({ ...prev, loading: true }));
      return;
    }
    if (status !== "authenticated") {
      setState({ ...VISITOR, loading: false });
      return;
    }

    let cancelled = false;

    async function loadAccess(opts?: { quiet?: boolean }) {
      if (!opts?.quiet) {
        setState((prev) => ({ ...prev, loading: true }));
      }
      try {
        const res = await fetch("/api/account/access", { cache: "no-store" });
        const data: unknown = await res.json();
        if (cancelled) return;
        setState(accessFromJson(data));
      } catch {
        if (cancelled) return;
        setState({
          kind: "visitor",
          isSignedIn: true,
          hasClientAccess: false,
          needsEmailVerification: false,
          email: null,
          loading: false,
        });
      }
    }

    void loadAccess();

    const onVerified = () => {
      void loadAccess({ quiet: true });
    };
    window.addEventListener(EMAIL_VERIFIED_EVENT, onVerified);

    return () => {
      cancelled = true;
      window.removeEventListener(EMAIL_VERIFIED_EVENT, onVerified);
    };
  }, [status]);

  return state;
}
