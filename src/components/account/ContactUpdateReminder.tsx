"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Phone } from "lucide-react";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EMAIL_VERIFIED_EVENT } from "@/lib/auth/verification-success-signal";
import { readJsonResponse } from "@/lib/http/fetch-json";
import { scheduleAfterFirstPaint } from "@/lib/mobile/schedule-idle";
import { cn } from "@/lib/utils";

const SNOOZE_KEY = "houzzat:contact-reminder-snooze";
const SNOOZE_MS = 12 * 60 * 60 * 1000;
const FADE_MS = 280;

type ContactStatus = {
  email: string;
  phone: string | null;
  needPhone: boolean;
  needEmail: boolean;
  phoneRequested: boolean;
  emailRequested: boolean;
};

type ViewMode = "prompt" | "minimized";

/** Digits-only length check — accepts common NA / intl formats. */
function looksLikePhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

function readPhoneInputValue(): string {
  if (typeof document === "undefined") return "";
  const el = document.getElementById(
    "contact-update-phone",
  ) as HTMLInputElement | null;
  return el?.value?.trim() ?? "";
}

function snoozeUntil(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SNOOZE_KEY);
    if (!raw) return null;
    const until = Number(raw);
    return Number.isFinite(until) ? until : null;
  } catch {
    return null;
  }
}

function isSnoozed() {
  const until = snoozeUntil();
  return until != null && until > Date.now();
}

function snooze() {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
  } catch {
    // ignore
  }
}

function clearSnooze() {
  try {
    localStorage.removeItem(SNOOZE_KEY);
  } catch {
    // ignore
  }
}

export function ContactUpdateReminder() {
  const pathname = usePathname();
  const { status, data: session } = useSession();
  const role = session?.user?.role;
  const { toast } = useSiteAlert();
  const aboveListingBar = pathname.startsWith("/listing/");
  const [mode, setMode] = useState<ViewMode | null>(null);
  const [info, setInfo] = useState<ContactStatus | null>(null);
  const [phoneDraft, setPhoneDraft] = useState("");
  const [emailDraft, setEmailDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promptVisible, setPromptVisible] = useState(false);
  const [chipVisible, setChipVisible] = useState(false);
  const fadeTimer = useRef<number | null>(null);
  const autoSaveAttempted = useRef(false);
  const saveInFlight = useRef(false);

  const clearFadeTimer = useCallback(() => {
    if (fadeTimer.current != null) {
      window.clearTimeout(fadeTimer.current);
      fadeTimer.current = null;
    }
  }, []);

  const load = useCallback(async () => {
    if (status !== "authenticated") {
      setMode(null);
      setInfo(null);
      setPromptVisible(false);
      setChipVisible(false);
      return;
    }
    if (role === "ADMIN" || role === "AGENT") {
      setMode(null);
      setInfo(null);
      setPromptVisible(false);
      setChipVisible(false);
      return;
    }

    const res = await fetch("/api/account/contact-status");
    if (!res.ok) return;
    const json = (await res.json()) as ContactStatus;
    const needed = json.needPhone || json.needEmail;
    if (!needed) {
      clearSnooze();
      setInfo(null);
      setMode(null);
      setPromptVisible(false);
      setChipVisible(false);
      autoSaveAttempted.current = false;
      return;
    }

    setInfo(json);
    setPhoneDraft(json.phone ?? "");
    setEmailDraft(json.email ?? "");
    setMode(isSnoozed() ? "minimized" : "prompt");
    // Allow a fresh auto-save attempt when the prompt reappears.
    autoSaveAttempted.current = false;
  }, [status, role]);

  const persistContact = useCallback(
    async (
      payload: { phone?: string; email?: string },
      options?: { silent?: boolean },
    ) => {
      if (saveInFlight.current) return false;
      saveInFlight.current = true;
      setPending(true);
      setError(null);
      try {
        const startedAt = performance.now();
        const res = await fetch("/api/account/contact", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const read = await readJsonResponse<{
          error?: string;
          needPhone?: boolean;
          needEmail?: boolean;
        }>(res, {
          route: "/api/account/contact",
          method: "PATCH",
          startedAt,
        });
        if (!read.ok) {
          setError("Could not save");
          return false;
        }
        if (!res.ok) {
          setError(read.data.error || "Could not save contact info");
          return false;
        }
        const json = read.data;

        clearSnooze();
        if (!options?.silent) {
          toast({
            message: "Contact information updated.",
            tone: "success",
          });
        }

        if (!json.needPhone && !json.needEmail) {
          setPromptVisible(false);
          clearFadeTimer();
          fadeTimer.current = window.setTimeout(() => {
            setInfo(null);
            setMode(null);
          }, FADE_MS);
        } else {
          await load();
        }
        return true;
      } catch {
        setError("Could not save");
        return false;
      } finally {
        saveInFlight.current = false;
        setPending(false);
      }
    },
    [clearFadeTimer, load, toast],
  );

  useEffect(() => {
    if (status !== "authenticated") {
      void load();
      return;
    }
    return scheduleAfterFirstPaint(
      () => {
        void load();
      },
      { timeoutMs: 3_200 },
    );
  }, [load, status]);

  useEffect(() => {
    const onVerified = () => {
      void load();
    };
    window.addEventListener(EMAIL_VERIFIED_EVENT, onVerified);
    return () => window.removeEventListener(EMAIL_VERIFIED_EVENT, onVerified);
  }, [load]);

  useEffect(() => () => clearFadeTimer(), [clearFadeTimer]);

  /**
   * When phone is missing (not an agent-forced re-request), auto-save a valid
   * number once it appears — browser / OS autofill often fills `tel` without a
   * React onChange. Skip agent-requested updates so the customer still confirms.
   */
  useEffect(() => {
    if (mode !== "prompt" || !info) return;
    if (!info.needPhone || info.phoneRequested || info.emailRequested) return;
    if (info.needEmail) return;

    const tryAutoSave = () => {
      if (autoSaveAttempted.current || saveInFlight.current) return;
      const fromState = phoneDraft.trim();
      const fromDom = readPhoneInputValue();
      const phone = looksLikePhone(fromState)
        ? fromState
        : looksLikePhone(fromDom)
          ? fromDom
          : "";
      if (!phone) return;

      autoSaveAttempted.current = true;
      if (phone !== fromState) setPhoneDraft(phone);
      void persistContact({ phone }, { silent: true }).then((ok) => {
        if (!ok) autoSaveAttempted.current = false;
      });
    };

    // Autofill often lands after paint / without firing React change events.
    const t0 = window.setTimeout(tryAutoSave, 50);
    const t1 = window.setTimeout(tryAutoSave, 400);
    const t2 = window.setTimeout(tryAutoSave, 1200);

    const onAnyInput = () => tryAutoSave();
    window.addEventListener("input", onAnyInput, true);
    window.addEventListener("change", onAnyInput, true);

    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener("input", onAnyInput, true);
      window.removeEventListener("change", onAnyInput, true);
    };
  }, [mode, info, phoneDraft, persistContact]);

  // Fade the active surface in when mode changes.
  useEffect(() => {
    clearFadeTimer();
    if (mode === "prompt") {
      setChipVisible(false);
      setPromptVisible(false);
      const frame = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setPromptVisible(true));
      });
      return () => window.cancelAnimationFrame(frame);
    }
    if (mode === "minimized") {
      setPromptVisible(false);
      setChipVisible(false);
      const frame = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setChipVisible(true));
      });
      return () => window.cancelAnimationFrame(frame);
    }
    setPromptVisible(false);
    setChipVisible(false);
    return undefined;
  }, [mode, clearFadeTimer]);

  useEffect(() => {
    if (mode !== "minimized") return;
    const until = snoozeUntil();
    if (until == null) {
      setMode("prompt");
      return;
    }
    const remaining = until - Date.now();
    if (remaining <= 0) {
      clearSnooze();
      setMode("prompt");
      return;
    }
    const timer = window.setTimeout(() => {
      clearSnooze();
      setMode("prompt");
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [mode]);

  async function save() {
    if (!info) return;
    const payload: { phone?: string; email?: string } = {};
    if (info.needPhone) {
      const phone = phoneDraft.trim() || readPhoneInputValue();
      payload.phone = phone;
    }
    if (info.needEmail) payload.email = emailDraft.trim();

    if (info.needPhone && !payload.phone) {
      setError("Please enter a phone number.");
      return;
    }
    if (info.needEmail && !payload.email) {
      setError("Please enter an email address.");
      return;
    }

    await persistContact(payload);
  }

  function chooseLater() {
    snooze();
    setError(null);
    setPromptVisible(false);
    clearFadeTimer();
    fadeTimer.current = window.setTimeout(() => {
      setMode("minimized");
    }, FADE_MS);
  }

  function openFromChip() {
    clearSnooze();
    setChipVisible(false);
    clearFadeTimer();
    fadeTimer.current = window.setTimeout(() => {
      setMode("prompt");
    }, FADE_MS);
  }

  if (!info || !mode) return null;

  if (mode === "minimized") {
    return (
      <button
        type="button"
        onClick={openFromChip}
        className={cn(
          // Same row as ScrollToTop (size-10): sit to its left with a small gap.
          "fixed z-40 flex max-w-[min(100%-7.5rem,15.5rem)] items-center gap-2.5",
          "right-[calc(1rem+2.5rem+0.5rem)] sm:right-[calc(1.5rem+2.5rem+0.5rem)]",
          aboveListingBar
            ? "bottom-[calc(var(--mobile-bottom-nav,0px)+4.75rem)] md:bottom-6"
            : "bottom-[calc(var(--mobile-bottom-nav,0px)+1.25rem)] sm:bottom-6",
          "rounded-full border border-canopy/25 bg-surface/95 px-3.5 py-2.5 text-left shadow-[0_8px_28px_rgba(20,32,28,0.14)]",
          "backdrop-blur-md transition-[opacity,transform,border-color,box-shadow] duration-300 ease-out",
          "hover:border-canopy/45 hover:shadow-[0_10px_32px_rgba(20,32,28,0.18)]",
          chipVisible
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none translate-y-1.5 opacity-0",
        )}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-canopy/12 text-canopy">
          <Phone className="size-3.5" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-semibold text-ink">
            Update contact info
          </span>
          <span className="block text-[11px] text-ink/50">Tap to continue</span>
        </span>
      </button>
    );
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-[80] flex items-end justify-center p-4 sm:items-center",
        "transition-opacity duration-300 ease-out",
        promptVisible
          ? "pointer-events-auto opacity-100"
          : "pointer-events-none opacity-0",
      )}
    >
      <div
        aria-hidden
        className={cn(
          "absolute inset-0 bg-ink/45 transition-opacity duration-300 ease-out",
          promptVisible ? "opacity-100" : "opacity-0",
        )}
      />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-update-title"
        autoComplete="on"
        className={cn(
          "relative w-full max-w-sm overflow-hidden rounded-3xl border border-line/80 bg-surface shadow-[0_24px_60px_rgba(20,32,28,0.22)]",
          "transition-[opacity,transform] duration-300 ease-out",
          promptVisible
            ? "translate-y-0 scale-100 opacity-100"
            : "translate-y-2 scale-[0.98] opacity-0",
        )}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div
          aria-hidden
          className="h-1.5 w-full bg-[linear-gradient(90deg,var(--canopy)_0%,var(--signal)_100%)]"
        />
        <div className="px-6 pb-6 pt-7 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-canopy/10 text-canopy">
            <Phone className="size-5" />
          </div>
          <h2
            id="contact-update-title"
            className="mt-4 font-display text-[1.65rem] leading-tight tracking-tight text-ink"
          >
            {info.phoneRequested || info.emailRequested
              ? "Please provide the correct contact details"
              : "Please update your contact information"}
          </h2>

          <div className="mt-5 space-y-3 text-left">
            {info.needPhone ? (
              <div className="space-y-1">
                <label
                  htmlFor="contact-update-phone"
                  className="text-xs font-semibold uppercase tracking-wide text-ink/45"
                >
                  Phone
                </label>
                <Input
                  id="contact-update-phone"
                  name="tel"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  autoFocus
                  value={phoneDraft}
                  onChange={(e) => setPhoneDraft(e.target.value)}
                  placeholder="+1 416 …"
                />
              </div>
            ) : null}
            {info.needEmail ? (
              <div className="space-y-1">
                <label
                  htmlFor="contact-update-email"
                  className="text-xs font-semibold uppercase tracking-wide text-ink/45"
                >
                  Email
                </label>
                <Input
                  id="contact-update-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoFocus={!info.needPhone}
                  value={emailDraft}
                  onChange={(e) => setEmailDraft(e.target.value)}
                  placeholder="you@email.com"
                />
              </div>
            ) : null}
          </div>

          {error ? (
            <p className="mt-3 text-left text-sm text-danger">{error}</p>
          ) : null}

          <div className="mt-6 grid grid-cols-2 gap-2.5">
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={chooseLater}
            >
              Later
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Update"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
