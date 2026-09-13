"use client";

import { useEffect, useState } from "react";
import { normalizeWhatsAppNumber } from "@/lib/whatsapp";

/**
 * Resolves the expert WhatsApp number from (1) SSR/prop or (2) hostname-bound
 * /api/public-config. Never uses a global NEXT_PUBLIC_ WhatsApp env number.
 */
export function useExpertWhatsAppNumber(initial?: string | null) {
  const [digits, setDigits] = useState<string | null>(() =>
    normalizeWhatsAppNumber(initial),
  );
  const [ready, setReady] = useState(() =>
    Boolean(normalizeWhatsAppNumber(initial)),
  );

  useEffect(() => {
    const fromInitial = normalizeWhatsAppNumber(initial);
    if (fromInitial) {
      setDigits(fromInitial);
      setReady(true);
      return;
    }

    let cancelled = false;
    void fetch("/api/public-config", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: unknown) => {
        if (cancelled) return;
        const expert =
          data &&
          typeof data === "object" &&
          "whatsappExpert" in data &&
          typeof (data as { whatsappExpert?: unknown }).whatsappExpert ===
            "string"
            ? (data as { whatsappExpert: string }).whatsappExpert
            : null;
        const next = normalizeWhatsAppNumber(expert);
        setDigits(next);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [initial]);

  return { digits, ready };
}
