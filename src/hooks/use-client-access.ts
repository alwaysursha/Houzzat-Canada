"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import type {
  ClientAccessKind,
  ResolvedClientAccess,
} from "@/lib/account-access";

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

/**
 * Site-wide client access for gates.
 * Prefer this over `useSession() === "authenticated"` for sold/VOW locks.
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
    setState((prev) => ({ ...prev, loading: true }));
    void fetch("/api/account/access")
      .then((res) => res.json())
      .then(
        (json: {
          kind?: ClientAccessKind;
          isSignedIn?: boolean;
          hasClientAccess?: boolean;
          needsEmailVerification?: boolean;
          email?: string | null;
        }) => {
          if (cancelled) return;
          setState({
            kind: json.kind ?? "visitor",
            isSignedIn: Boolean(json.isSignedIn),
            hasClientAccess: Boolean(json.hasClientAccess),
            needsEmailVerification: Boolean(json.needsEmailVerification),
            email: json.email ?? null,
            loading: false,
          });
        },
      )
      .catch(() => {
        if (cancelled) return;
        setState({
          kind: "visitor",
          isSignedIn: status === "authenticated",
          hasClientAccess: false,
          needsEmailVerification: false,
          email: null,
          loading: false,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [status]);

  return state;
}
