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

function accessStatusCopy(
  status: ReturnType<typeof getAccountAccessStatus>,
): { label: string; tone: "ok" | "grace" | "locked" } {
  switch (status) {
    case "verified_unlocked":
      return { label: "Verified — Full Access", tone: "ok" };
    case "unverified_unlocked":
      return {
        label: "Unverified — Limited Time Full Access",
        tone: "grace",
      };
    case "unverified_locked":
      return { label: "Unverified — Limited Access", tone: "locked" };
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function AccountProfileHeader({ user }: { user: CustomerUser }) {
  const status = getAccountAccessStatus(user);
  const { label: statusLabel, tone } = accessStatusCopy(status);
  const graceDays = getVerifyGraceDaysRemaining(user);
  const phone = user.phone?.trim() || null;

  return (
    <div
      className={cn(
        "relative -mx-4 overflow-hidden text-white sm:-mx-6",
        "md:mx-0 md:rounded-3xl md:border md:border-canopy/20 md:shadow-[0_24px_55px_-28px_rgba(15,40,30,0.45)]",
      )}
    >
      <div
        className="relative bg-canopy px-6 pb-8 pt-7 sm:px-8 md:px-9 md:pb-9 md:pt-8"
        style={{
          backgroundImage: [
            "linear-gradient(135deg, rgba(255,255,255,0.07) 25%, transparent 25%)",
            "linear-gradient(225deg, rgba(255,255,255,0.07) 25%, transparent 25%)",
            "linear-gradient(45deg, rgba(255,255,255,0.07) 25%, transparent 25%)",
            "linear-gradient(315deg, rgba(255,255,255,0.07) 25%, transparent 25%)",
          ].join(", "),
          backgroundSize: "28px 28px",
          backgroundPosition: "0 0, 14px 0, 14px -14px, 0 14px",
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-black/10"
        />

        <div className="relative text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/75">
            Account
          </p>
          <h1 className="mt-2 font-display text-3xl leading-tight text-white sm:text-4xl">
            {displayName(user)}
          </h1>
          <p className="mt-2 text-sm text-white/90">{user.email}</p>
          {phone ? (
            <p className="mt-1 text-sm text-white/75">{phone}</p>
          ) : null}

          <div className="mx-auto mt-5 max-w-md space-y-3">
            <p
              className={cn(
                "inline-flex rounded-full px-3.5 py-1 text-xs font-semibold tracking-wide",
                tone === "ok" && "bg-white/20 text-white",
                tone === "grace" && "bg-amber-300/25 text-amber-50",
                tone === "locked" && "bg-white/15 text-white/95 ring-1 ring-white/25",
              )}
            >
              {statusLabel}
            </p>

            {status === "unverified_unlocked" ? (
              <AccountVerifyEmailAction
                daysRemaining={graceDays}
                callbackUrl="/account"
              />
            ) : null}

            {status === "unverified_locked" ? (
              <AccountVerifyEmailAction callbackUrl="/account" />
            ) : null}
          </div>

          <div className="mt-6 md:hidden">
            <SignOutButton
              label="Log out"
              className="inline-flex rounded-xl border border-white/35 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
