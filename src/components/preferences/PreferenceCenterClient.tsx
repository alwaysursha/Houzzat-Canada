"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PreferenceSwitch } from "@/components/preferences/PreferenceSwitch";
import { NotificationPreferencesForm } from "@/components/notifications/NotificationPreferencesForm";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import type { PublicPreferenceCenterPayload } from "@/lib/communications/preference-email-chrome";
import { PREFERENCE_CENTER_EMAIL_CATEGORIES } from "@/lib/communications/preference-center-catalog";
import { derivePreferenceCenterUiState } from "@/lib/communications/preference-center-ui-state";
import type { CustomerOptionalEmailCategory } from "@/lib/communications/classification";
import { catalogForAudience } from "@/lib/notifications/catalog";
import { useTenantBrand, useTenantDisplayName } from "@/components/tenancy/TenantBrandProvider";
import { tenantAccountLabel } from "@/lib/tenancy/marketing-presentation-brand";
import { cn } from "@/lib/utils";

type PushItem = {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
};

type LoadState =
  | { status: "loading" }
  | { status: "ready"; preferences: PublicPreferenceCenterPayload }
  | { status: "invalid_token" }
  | { status: "error"; message: string }
  | { status: "signin_required" };

function categoryEnabledMap(
  preferences: PublicPreferenceCenterPayload,
): Record<CustomerOptionalEmailCategory, boolean> {
  const map = {} as Record<CustomerOptionalEmailCategory, boolean>;
  for (const item of PREFERENCE_CENTER_EMAIL_CATEGORIES) {
    const row = preferences.categories.find((c) => c.category === item.category);
    map[item.category] = row?.enabled ?? true;
  }
  return map;
}

export function PreferenceCenterClient({
  initialToken,
  initialAction,
}: {
  initialToken: string | null;
  initialAction: string | null;
}) {
  const { status: sessionStatus } = useSession();
  const brandName = useTenantDisplayName("Houzzat");
  const brand = useTenantBrand();
  const accountLabel = brand ? tenantAccountLabel(brand) : "Your account";
  const { confirm, toast } = useSiteAlert();
  const tokenRef = useRef<string | null>(
    initialToken && initialToken.trim().length >= 16 ? initialToken.trim() : null,
  );
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [categoryState, setCategoryState] = useState<
    Record<CustomerOptionalEmailCategory, boolean> | null
  >(null);
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);
  const [pendingGlobal, setPendingGlobal] = useState(false);
  const [pushItems, setPushItems] = useState<PushItem[] | null>(null);
  const [unsubscribeHighlight, setUnsubscribeHighlight] = useState(
    initialAction === "unsubscribe",
  );
  const inFlightRef = useRef(new Set<string>());
  const openedUnsubRef = useRef(false);

  const mode = tokenRef.current ? "token" : "authenticated";
  const signedIn = sessionStatus === "authenticated";

  const readUrl = useMemo(() => {
    if (tokenRef.current) {
      return `/api/preferences/email?token=${encodeURIComponent(tokenRef.current)}`;
    }
    return "/api/account/communication-preferences";
  }, []);

  const applyPreferences = useCallback((preferences: PublicPreferenceCenterPayload) => {
    setLoadState({ status: "ready", preferences });
    setCategoryState(categoryEnabledMap(preferences));
  }, []);

  const loadPreferences = useCallback(async () => {
    setLoadState({ status: "loading" });
    try {
      if (!tokenRef.current && sessionStatus === "unauthenticated") {
        setLoadState({ status: "signin_required" });
        return;
      }
      if (!tokenRef.current && sessionStatus === "loading") {
        return;
      }
      const res = await fetch(readUrl, { method: "GET", cache: "no-store" });
      if (res.status === 401) {
        setLoadState(
          tokenRef.current
            ? { status: "invalid_token" }
            : { status: "signin_required" },
        );
        return;
      }
      if (!res.ok) {
        setLoadState({
          status: "error",
          message: "Could not load your preferences. Please try again.",
        });
        return;
      }
      const json = (await res.json()) as {
        ok?: boolean;
        preferences?: PublicPreferenceCenterPayload;
      };
      if (!json.ok || !json.preferences) {
        setLoadState({
          status: "error",
          message: "Could not load your preferences. Please try again.",
        });
        return;
      }
      applyPreferences(json.preferences);
    } catch {
      setLoadState({
        status: "error",
        message: "Could not load your preferences. Please try again.",
      });
    }
  }, [applyPreferences, readUrl, sessionStatus]);

  useEffect(() => {
    void loadPreferences();
  }, [loadPreferences]);

  useEffect(() => {
    // Token mode never loads session push — avoids mixing identities.
    if (mode !== "authenticated" || !signedIn) {
      setPushItems(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/notifications/preferences", {
          method: "GET",
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const json = (await res.json().catch(() => null)) as {
          items?: PushItem[];
        } | null;
        if (json?.items?.length) {
          if (!cancelled) setPushItems(json.items);
          return;
        }
        if (!cancelled) {
          setPushItems(
            catalogForAudience("consumer").map((item) => ({
              ...item,
              enabled: true,
            })),
          );
        }
      } catch {
        if (!cancelled) {
          setPushItems(
            catalogForAudience("consumer").map((item) => ({
              ...item,
              enabled: true,
            })),
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, signedIn]);

  async function mutate(body: Record<string, unknown>) {
    if (tokenRef.current) {
      const res = await fetch("/api/preferences/email", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: tokenRef.current, ...body }),
      });
      return res;
    }
    return fetch("/api/account/communication-preferences", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function onToggleCategory(
    category: CustomerOptionalEmailCategory,
    enabled: boolean,
  ) {
    if (!categoryState) return;
    if (inFlightRef.current.has(category)) return;
    inFlightRef.current.add(category);
    const previous = categoryState;
    setCategoryState({ ...categoryState, [category]: enabled });
    setPendingCategory(category);
    try {
      const res = await mutate({
        category,
        channel: "email",
        enabled,
      });
      if (!res.ok) {
        setCategoryState(previous);
        toast({
          message: "Could not update that preference. Please try again.",
          tone: "error",
        });
        return;
      }
      const json = (await res.json()) as {
        ok?: boolean;
        preferences?: PublicPreferenceCenterPayload;
      };
      if (json.ok && json.preferences) {
        applyPreferences(json.preferences);
      }
      toast({ message: "Preference updated", tone: "success" });
    } catch {
      setCategoryState(previous);
      toast({
        message: "Could not update that preference. Please try again.",
        tone: "error",
      });
    } finally {
      inFlightRef.current.delete(category);
      setPendingCategory(null);
    }
  }

  async function onConfirmUnsubscribe() {
    if (pendingGlobal || inFlightRef.current.has("global")) return;
    const confirmed = await confirm({
      title: "Unsubscribe from all emails?",
      message:
        "You’ll stop receiving optional property alerts, market updates and communications. Important account and security emails will still be sent.",
      confirmLabel: "Unsubscribe",
      cancelLabel: "Keep emails",
      destructive: true,
    });
    if (!confirmed) return;
    inFlightRef.current.add("global");
    setPendingGlobal(true);
    try {
      const res = await mutate({ globalOptionalEmail: false });
      if (!res.ok) {
        toast({
          message: "Could not pause email notifications. Please try again.",
          tone: "error",
        });
        return;
      }
      const json = (await res.json()) as {
        ok?: boolean;
        preferences?: PublicPreferenceCenterPayload;
      };
      if (json.ok && json.preferences) applyPreferences(json.preferences);
      setUnsubscribeHighlight(false);
      toast({ message: "Email notifications paused", tone: "success" });
    } catch {
      toast({
        message: "Could not pause email notifications. Please try again.",
        tone: "error",
      });
    } finally {
      inFlightRef.current.delete("global");
      setPendingGlobal(false);
    }
  }

  useEffect(() => {
    if (
      loadState.status !== "ready" ||
      initialAction !== "unsubscribe" ||
      openedUnsubRef.current
    ) {
      return;
    }
    if (
      loadState.preferences.customerUnsubscribed ||
      !loadState.preferences.globalEmailEnabled
    ) {
      openedUnsubRef.current = true;
      return;
    }
    openedUnsubRef.current = true;
    void onConfirmUnsubscribe();
    // Intentionally run once when preferences first become ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadState.status]);

  async function onResume() {
    if (pendingGlobal || inFlightRef.current.has("global")) return;
    inFlightRef.current.add("global");
    setPendingGlobal(true);
    try {
      const res = await mutate({ globalOptionalEmail: true });
      if (!res.ok) {
        toast({
          message: "Could not resume email notifications. Please try again.",
          tone: "error",
        });
        return;
      }
      const json = (await res.json()) as {
        ok?: boolean;
        preferences?: PublicPreferenceCenterPayload;
      };
      if (json.ok && json.preferences) applyPreferences(json.preferences);
      toast({ message: "Email notifications resumed", tone: "success" });
    } catch {
      toast({
        message: "Could not resume email notifications. Please try again.",
        tone: "error",
      });
    } finally {
      inFlightRef.current.delete("global");
      setPendingGlobal(false);
    }
  }

  if (loadState.status === "loading" || sessionStatus === "loading") {
    return (
      <Shell>
        <p className="text-sm text-ink/60" aria-live="polite">
          Loading your communication preferences…
        </p>
      </Shell>
    );
  }

  if (loadState.status === "invalid_token") {
    return (
      <Shell>
        <h1 className="font-display text-3xl tracking-tight text-ink">
          This preference link is no longer valid
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink/65">
          Sign in to manage your email preferences from your account.
        </p>
        <Link
          href="/auth/sign-in?callbackUrl=%2Fpreferences%2Femail"
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-canopy px-5 text-sm font-semibold text-white transition hover:bg-canopy/90"
        >
          Sign in
        </Link>
      </Shell>
    );
  }

  if (loadState.status === "signin_required") {
    return (
      <Shell>
        <h1 className="font-display text-3xl tracking-tight text-ink">
          Communication Preferences
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink/65">
          Sign in to choose which updates you’d like to receive from {brandName}.
        </p>
        <Link
          href="/auth/sign-in?callbackUrl=%2Fpreferences%2Femail"
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-canopy px-5 text-sm font-semibold text-white transition hover:bg-canopy/90"
        >
          Sign in
        </Link>
      </Shell>
    );
  }

  if (loadState.status === "error") {
    return (
      <Shell>
        <h1 className="font-display text-3xl tracking-tight text-ink">
          Communication Preferences
        </h1>
        <p className="mt-3 text-sm text-danger" role="alert">
          {loadState.message}
        </p>
        <button
          type="button"
          onClick={() => void loadPreferences()}
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl border border-line bg-surface px-5 text-sm font-semibold text-ink transition hover:border-canopy/40"
        >
          Try again
        </button>
      </Shell>
    );
  }

  const preferences = loadState.preferences;
  const ui = derivePreferenceCenterUiState({
    customerUnsubscribed: preferences.customerUnsubscribed,
    globalEmailEnabled: preferences.globalEmailEnabled,
    mailboxSuppressed: preferences.mailboxSuppressed,
    hasManageToken: mode === "token",
    sessionAuthenticated: signedIn,
  });
  const mismatch = preferences.optionalEmailMismatch === true;
  const customerOptionalPaused =
    preferences.customerUnsubscribed || !preferences.globalEmailEnabled;

  return (
    <Shell>
      <header className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-canopy">
          {accountLabel}
        </p>
        <h1 className="mt-2 font-display text-3xl tracking-tight text-ink sm:text-4xl">
          Communication Preferences
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink/65 sm:text-[15px]">
          Choose which updates you’d like to receive from {brandName}.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink/50">
          Important account and security messages may still be sent.
        </p>
      </header>

      {mismatch ? (
        <div
          className="mt-8 rounded-2xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-ink"
          role="status"
        >
          Your email preferences are being updated. Please refresh and try
          again.
        </div>
      ) : null}

      {ui.showMailboxWarning ? (
        <div
          className="mt-8 rounded-2xl border border-line bg-mist/70 px-4 py-4 text-sm leading-relaxed text-ink/75"
          role="status"
          data-testid="mailbox-delivery-warning"
        >
          <p className="font-semibold text-ink">
            {"We can't currently deliver email to this address"}
          </p>
          <p className="mt-1">
            Delivery has been paused because messages could not be delivered or
            were reported. Your category choices below are saved, but email may
            not arrive until delivery is restored.
          </p>
        </div>
      ) : null}

      {ui.showGlobalPause ? (
        <div
          className="mt-8 rounded-2xl border border-canopy/20 bg-canopy/5 px-4 py-4"
          role="status"
          data-testid="global-email-pause"
        >
          <p className="font-semibold text-canopy-deep">
            Optional emails are turned off
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ink/65">
            Your individual preferences are saved below. Resume emails whenever
            you’re ready.
          </p>
          {ui.resumeHasDeliveryCaveat ? (
            <p
              className="mt-2 text-sm leading-relaxed text-ink/60"
              data-testid="resume-delivery-caveat"
            >
              {
                "You can resume your email preferences, but delivery will remain paused until we're able to deliver to this address again."
              }
            </p>
          ) : null}
          {ui.showResume ? (
            <button
              type="button"
              disabled={pendingGlobal}
              onClick={() => void onResume()}
              data-testid="resume-email-notifications"
              className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-canopy px-5 text-sm font-semibold text-white transition hover:bg-canopy/90 disabled:opacity-60"
            >
              {pendingGlobal ? "Saving…" : "Resume email notifications"}
            </button>
          ) : null}
        </div>
      ) : null}

      <section className="mt-10" aria-labelledby="email-prefs-heading">
        <h2
          id="email-prefs-heading"
          className="font-display text-2xl tracking-tight text-ink"
        >
          Email notifications
        </h2>
        <ul className="mt-4 divide-y divide-line/80 overflow-hidden rounded-2xl border border-line bg-surface">
          {PREFERENCE_CENTER_EMAIL_CATEGORIES.map((item) => {
            const enabled = categoryState?.[item.category] ?? true;
            const pausedHint = customerOptionalPaused
              ? "Saved, but currently paused because all optional emails are turned off."
              : preferences.mailboxSuppressed
                ? "Saved, but email delivery is currently paused for this address."
                : null;
            return (
              <li key={item.category} className="px-4 py-4 sm:px-5">
                <div className="flex items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <label
                      htmlFor={`email-cat-${item.category}`}
                      className="block text-sm font-semibold text-ink"
                    >
                      {item.title}
                    </label>
                    <p className="mt-1 text-[13px] leading-snug text-ink/55">
                      {item.description}
                    </p>
                    {item.footnote ? (
                      <p className="mt-1 text-[12px] leading-snug text-ink/40">
                        {item.footnote}
                      </p>
                    ) : null}
                    {pausedHint ? (
                      <p className="mt-2 text-[12px] font-medium text-canopy-deep/80">
                        {pausedHint}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-1 pt-0.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">
                      Email
                    </span>
                    <PreferenceSwitch
                      id={`email-cat-${item.category}`}
                      checked={enabled}
                      pending={pendingCategory === item.category}
                      disabled={mismatch}
                      label={`${item.title} email`}
                      onCheckedChange={(next) =>
                        void onToggleCategory(item.category, next)
                      }
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section
        id="email-global"
        className={cn(
          "mt-10 rounded-2xl border px-4 py-5 sm:px-5",
          unsubscribeHighlight
            ? "border-canopy/40 bg-canopy/5 ring-2 ring-canopy/20"
            : "border-line bg-surface",
        )}
        aria-labelledby="email-global-heading"
      >
        <h2
          id="email-global-heading"
          className="font-display text-2xl tracking-tight text-ink"
        >
          Email preferences
        </h2>
        {ui.showUnsubscribeCta ? (
          <>
            <p className="mt-2 text-sm leading-relaxed text-ink/60">
              Stop property alerts, market updates and other optional emails.
              Important account and security messages may still be sent.
            </p>
            <button
              type="button"
              disabled={pendingGlobal || mismatch}
              onClick={() => void onConfirmUnsubscribe()}
              className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl border border-line bg-mist/50 px-5 text-sm font-semibold text-ink transition hover:border-danger/30 hover:text-danger disabled:opacity-60"
            >
              Unsubscribe from all optional emails
            </button>
          </>
        ) : (
          <p className="mt-2 text-sm leading-relaxed text-ink/60">
            Optional email is currently off. Your category choices above remain
            saved.
          </p>
        )}
      </section>

      <section
        id="push"
        className="mt-12"
        aria-labelledby="push-prefs-heading"
      >
        <h2
          id="push-prefs-heading"
          className="font-display text-2xl tracking-tight text-ink"
        >
          Push notifications
        </h2>
        {ui.showAuthenticatedPush && pushItems ? (
          <div className="mt-4" data-testid="authenticated-push-controls">
            <NotificationPreferencesForm
              items={pushItems}
              showDeviceActions
              intro={`Choose which ${brandName} alerts reach your phone. Push is separate from email.`}
            />
          </div>
        ) : (
          <div
            className="mt-4 rounded-2xl border border-line bg-mist/40 px-4 py-4 text-sm text-ink/65"
            data-testid="push-signin-prompt"
          >
            <p>Sign in to manage push notifications for your devices.</p>
            <Link
              href="/auth/sign-in?callbackUrl=%2Fpreferences%2Femail%23push"
              className="mt-3 inline-flex min-h-11 items-center font-semibold text-canopy hover:underline"
            >
              Sign in to manage push
            </Link>
          </div>
        )}
      </section>

      {mode === "authenticated" || signedIn ? (
        <p className="mt-10 text-sm text-ink/45">
          Phone and SMS settings remain on{" "}
          <Link href="/account" className="font-semibold text-canopy hover:underline">
            {accountLabel}
          </Link>
          .
        </p>
      ) : null}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const brandName = useTenantDisplayName("Houzzat");
  return (
    <main className="relative min-h-[100dvh] overflow-x-hidden bg-[linear-gradient(180deg,#f3faf6_0%,#ffffff_42%,#f7fbf9_100%)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(circle_at_20%_0%,rgba(15,107,76,0.12),transparent_55%)]" />
      <div className="relative mx-auto w-full max-w-3xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        <div className="mb-8 flex items-center justify-between gap-3">
          <Link
            href="/"
            className="text-sm font-semibold text-canopy hover:underline"
          >
            {brandName}
          </Link>
          <Link
            href="/account"
            className="text-sm font-medium text-ink/55 hover:text-ink"
          >
            Account
          </Link>
        </div>
        {children}
      </div>
    </main>
  );
}
