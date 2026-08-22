import { Clock3, Lock, Mail, Phone, ShieldCheck } from "lucide-react";
import { AccountVerifyEmailAction } from "@/components/account/AccountVerifyEmailAction";
import { SignOutButton } from "@/components/auth/SignOutButton";
import type { CustomerUser } from "@/lib/account";
import {
  getAccountAccessStatus,
  getVerifyGraceDaysRemaining,
} from "@/lib/account-access";
import { cn } from "@/lib/utils";

function displayName(user: CustomerUser): string {
  const name = user.name?.trim();
  if (name) return name;
  const local = user.email.split("@")[0]?.trim();
  return local || "Your account";
}

type AccessTone = "ok" | "grace" | "locked";

function accessStatusCopy(
  status: ReturnType<typeof getAccountAccessStatus>,
): { label: string; detail: string; tone: AccessTone } {
  switch (status) {
    case "verified_unlocked":
      return {
        label: "Verified",
        detail: "Full access to sold prices, saved homes, and client tools.",
        tone: "ok",
      };
    case "unverified_unlocked":
      return {
        label: "Unverified",
        detail: "Limited-time full access while you confirm your email.",
        tone: "grace",
      };
    case "unverified_locked":
      return {
        label: "Unverified",
        detail: "Verify your email to restore sold prices and client tools.",
        tone: "locked",
      };
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function StatusIcon({ tone }: { tone: AccessTone }) {
  const className = "size-4 shrink-0";
  switch (tone) {
    case "ok":
      return <ShieldCheck className={className} strokeWidth={2.25} aria-hidden />;
    case "grace":
      return <Clock3 className={className} strokeWidth={2.25} aria-hidden />;
    case "locked":
      return <Lock className={className} strokeWidth={2.25} aria-hidden />;
    default: {
      const _exhaustive: never = tone;
      return _exhaustive;
    }
  }
}

export function AccountProfileHeader({ user }: { user: CustomerUser }) {
  const status = getAccountAccessStatus(user);
  const { label: statusLabel, detail, tone } = accessStatusCopy(status);
  const graceDays = getVerifyGraceDaysRemaining(user);
  const phone = user.phone?.trim() || null;

  return (
    <section
      className={cn(
        "relative -mx-4 overflow-hidden border-y border-line/80 bg-surface sm:-mx-6",
        "md:mx-0 md:rounded-[1.75rem] md:border md:shadow-[0_28px_70px_-42px_rgba(15,40,30,0.35)]",
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-canopy/[0.07] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -left-12 size-48 rounded-full bg-signal/[0.06] blur-3xl"
      />

      <div className="relative px-5 py-7 sm:px-8 sm:py-8">
        <div className="flex items-start justify-between gap-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-canopy">
            Account
          </p>
          <div className="md:hidden">
            <SignOutButton
              label="Log out"
              className="rounded-lg px-2 py-1 text-xs font-semibold text-ink/45 transition hover:bg-mist hover:text-ink"
            />
          </div>
        </div>

        <div className="mt-4">
          <h1 className="font-display text-[2rem] leading-[1.1] tracking-[-0.02em] text-ink sm:text-4xl">
            {displayName(user)}
          </h1>

          <dl className="mt-4 space-y-2">
            <div className="flex items-center gap-2.5 text-sm text-ink/70">
              <span className="inline-flex size-8 items-center justify-center rounded-full bg-mist text-ink/40">
                <Mail className="size-3.5" strokeWidth={2.25} aria-hidden />
              </span>
              <dd className="min-w-0 truncate">{user.email}</dd>
            </div>
            {phone ? (
              <div className="flex items-center gap-2.5 text-sm text-ink/70">
                <span className="inline-flex size-8 items-center justify-center rounded-full bg-mist text-ink/40">
                  <Phone className="size-3.5" strokeWidth={2.25} aria-hidden />
                </span>
                <dd>{phone}</dd>
              </div>
            ) : null}
          </dl>
        </div>

        <div
          className={cn(
            "mt-6 rounded-2xl border px-4 py-4 sm:px-5",
            tone === "ok" &&
              "border-canopy/15 bg-gradient-to-br from-canopy/[0.06] via-canopy/[0.03] to-transparent",
            tone === "grace" &&
              "border-amber/25 bg-gradient-to-br from-amber/[0.08] via-amber/[0.03] to-transparent",
            tone === "locked" &&
              "border-line bg-gradient-to-br from-mist via-surface to-mist/40",
          )}
        >
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "mt-0.5 inline-flex size-9 items-center justify-center rounded-xl",
                tone === "ok" && "bg-canopy/12 text-canopy",
                tone === "grace" && "bg-amber/15 text-amber",
                tone === "locked" && "bg-ink/[0.06] text-ink/55",
              )}
            >
              <StatusIcon tone={tone} />
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-semibold text-ink">
                {statusLabel}
                {tone === "ok" ? (
                  <span className="font-normal text-ink/45"> · Full access</span>
                ) : tone === "grace" ? (
                  <span className="font-normal text-ink/45">
                    {" "}
                    · Limited-time full access
                  </span>
                ) : (
                  <span className="font-normal text-ink/45"> · Limited access</span>
                )}
              </p>
              <p className="text-sm leading-relaxed text-ink/55">{detail}</p>
            </div>
          </div>

          {status === "unverified_unlocked" ? (
            <AccountVerifyEmailAction
              className="mt-4 border-t border-amber/15 pt-4"
              daysRemaining={graceDays}
              callbackUrl="/account"
            />
          ) : null}

          {status === "unverified_locked" ? (
            <AccountVerifyEmailAction
              className="mt-4 border-t border-line pt-4"
              callbackUrl="/account"
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
