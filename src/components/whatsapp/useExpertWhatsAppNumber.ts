"use client";

import { useEffect, useState } from "react";
import {
  getExpertWhatsAppNumber,
  normalizeWhatsAppNumber,
} from "@/lib/whatsapp";

/**
 * Resolves the expert WhatsApp number from (1) SSR/prop, (2) build-time
 * NEXT_PUBLIC_*, or (3) Worker runtime via /api/public-config.
 */
export function useExpertWhatsAppNumber(initial?: string | null) {
  const [digits, setDigits] = useState<string | null>(
    () =>
      normalizeWhatsAppNumber(initial) ?? getExpertWhatsAppNumber(),
  );
  const [ready, setReady] = useState(
    () =>
      Boolean(normalizeWhatsAppNumber(initial) ?? getExpertWhatsAppNumber()),
  );

  useEffect(() => {
    const fromInitial = normalizeWhatsAppNumber(initial);
    if (fromInitial) {
      setDigits(fromInitial);
      setReady(true);
      return;
    }
    if (digits) {
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
        if (next) setDigits(next);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [initial, digits]);

  return { digits, ready };
}
