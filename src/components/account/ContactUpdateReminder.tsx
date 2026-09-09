"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Mail, Phone } from "lucide-react";
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

  useEffect(() => {
    if (mode !== "prompt") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      snooze();
      setError(null);
      setPromptVisible(false);
      clearFadeTimer();
      fadeTimer.current = window.setTimeout(() => {
        setMode("minimized");
      }, FADE_MS);
    }
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey, true);
    };
  }, [mode, clearFadeTimer]);

  if (!info || !mode) return null;

  const requested = info.phoneRequested || info.emailRequested;
  const title = requested
    ? "Please confirm your contact details"
    : info.needEmail && !info.needPhone
      ? "Please confirm your email"
      : "Add a phone number we can use";
  const subtitle = requested
    ? "Your agent asked you to confirm the details they should use to reach you about showings and updates."
    : "We use this only to reach you about homes and appointments — never shared publicly.";
  const PromptIcon = info.needPhone ? Phone : Mail;

  if (mode === "minimized") {
    return (
      <button
        type="button"
        onClick={openFromChip}
        className={cn(
          "fixed z-40 flex max-w-[min(100%-7.5rem,17rem)] items-center gap-3",
          "right-[calc(1rem+2.5rem+0.5rem)] sm:right-[calc(1.5rem+2.5rem+0.5rem)]",
          aboveListingBar
            ? "bottom-[calc(var(--mobile-bottom-nav,0px)+4.75rem)] md:bottom-6"
            : "bottom-[calc(var(--mobile-bottom-nav,0px)+1.25rem)] sm:bottom-6",
          "rounded-2xl border border-white/70 bg-surface/90 px-3.5 py-2.5 text-left",
          "shadow-[0_12px_40px_rgba(20,32,28,0.16)] backdrop-blur-xl",
          "transition-[opacity,transform] duration-300 ease-out",
          "hover:border-canopy/35 hover:shadow-[0_16px_44px_rgba(20,32,28,0.2)]",
          chipVisible
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none translate-y-1.5 opacity-0",
        )}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-canopy text-white shadow-[0_6px_16px_rgba(15,107,76,0.28)]">
          <Phone className="size-4" strokeWidth={1.75} />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-display text-[15px] leading-tight text-ink">
            Contact details
          </span>
          <span className="mt-0.5 block text-[11px] tracking-wide text-ink/50">
            Finish in a moment
          </span>
        </span>
      </button>
    );
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6",
        "transition-opacity duration-300 ease-out",
        promptVisible
          ? "pointer-events-auto opacity-100"
          : "pointer-events-none opacity-0",
      )}
    >
      <div
        aria-hidden
        className={cn(
          "absolute inset-0 bg-[#14201c]/50 backdrop-blur-[6px] transition-opacity duration-300 ease-out",
          promptVisible ? "opacity-100" : "opacity-0",
        )}
      />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-update-title"
        autoComplete="on"
        className={cn(
          "relative w-full max-w-[26.5rem] overflow-hidden",
          "rounded-t-[1.75rem] border border-white/80 bg-surface sm:rounded-[1.75rem]",
          "shadow-[0_32px_80px_rgba(20,32,28,0.28)]",
          "transition-[opacity,transform] duration-300 ease-out",
          promptVisible
            ? "translate-y-0 opacity-100"
            : "translate-y-8 opacity-0 sm:translate-y-3",
        )}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div
          aria-hidden
          className="h-[3px] w-full bg-[linear-gradient(90deg,var(--canopy)_0%,var(--signal)_100%)]"
        />
        <div className="px-6 pb-6 pt-6 sm:px-8 sm:pt-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-canopy">
            {requested ? "Requested by your agent" : "Houzzat account"}
          </p>
          <div className="mt-4 flex items-start gap-4">
            <span className="mt-0.5 flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(160deg,#0f6b4c_0%,#0a4d38_100%)] text-white shadow-[0_10px_24px_rgba(15,107,76,0.28)]">
              <PromptIcon className="size-5" strokeWidth={1.6} />
            </span>
            <div className="min-w-0 pt-0.5">
              <h2
                id="contact-update-title"
                className="font-display text-[1.7rem] leading-[1.15] tracking-[-0.03em] text-ink sm:text-[1.85rem]"
              >
                {title}
              </h2>
            </div>
          </div>
          <p className="mt-4 text-[15px] leading-relaxed text-ink/65">
            {subtitle}
          </p>

          <div className="mt-6 space-y-4">
            {info.needPhone ? (
              <div className="space-y-1.5">
                <label
                  htmlFor="contact-update-phone"
                  className="text-[12px] font-semibold tracking-wide text-ink/70"
                >
                  Phone number
                </label>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink/35" />
                  <Input
                    id="contact-update-phone"
                    name="tel"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    autoFocus
                    value={phoneDraft}
                    onChange={(e) => setPhoneDraft(e.target.value)}
                    placeholder="+1 416 555 0100"
                    className="h-12 rounded-xl border-line/90 bg-mist/50 pl-11 text-[15px] shadow-inner focus-visible:bg-surface"
                  />
                </div>
              </div>
            ) : null}
            {info.needEmail ? (
              <div className="space-y-1.5">
                <label
                  htmlFor="contact-update-email"
                  className="text-[12px] font-semibold tracking-wide text-ink/70"
                >
                  Email address
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink/35" />
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
                    className="h-12 rounded-xl border-line/90 bg-mist/50 pl-11 text-[15px] shadow-inner focus-visible:bg-surface"
                  />
                </div>
              </div>
            ) : null}
          </div>

          {error ? (
            <p className="mt-4 text-sm text-danger">{error}</p>
          ) : null}

          <div className="mt-7 flex flex-col-reverse gap-2.5 sm:flex-row sm:items-center">
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={chooseLater}
              className="h-12 flex-1 text-ink/60 hover:bg-mist hover:text-ink"
            >
              I’ll do this later
            </Button>
            <Button
              type="submit"
              disabled={pending}
              className="h-12 flex-1 rounded-xl text-[15px] shadow-[0_10px_24px_rgba(15,107,76,0.22)]"
            >
              {pending ? "Saving…" : "Save details"}
            </Button>
          </div>
          <p className="mt-4 text-center text-[11px] leading-relaxed text-ink/40">
            Saved privately to your Houzzat account. You can change this anytime.
          </p>
        </div>
      </form>
    </div>
  );
}

