"use client";

import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { staffHardNavigate } from "@/components/site/StaffHardLink";
import type { InvitePreview } from "@/lib/agent/accept-invite";
import { rememberLoginCredentials } from "@/lib/auth/remembered-login";

type InviteClientPreview = InvitePreview & {
  needsPasswordActivation?: boolean;
  profilePrefilled?: boolean;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  recoLicenseNumber?: string | null;
  recoLicenseExpiresAt?: string | null;
};

function roleLabel(role: string) {
  if (role === "OWNER") return "Owner";
  if (role === "ADMIN") return "Team admin";
  return "Agent";
}

function consumerLabelText(labels: Array<"buyer" | "seller">) {
  return labels
    .map((l) => (l === "seller" ? "seller (/owner)" : "buyer (/account)"))
    .join(" and ");
}

export function TeamInviteClient({ token }: { token: string }) {
  const router = useRouter();
  const { update } = useSession();
  const [invite, setInvite] = useState<InviteClientPreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/auth/invite/${encodeURIComponent(token)}`);
      const json = (await res.json()) as {
        invite?: InviteClientPreview;
        error?: string;
      };
      if (cancelled) return;
      if (!res.ok || !json.invite) {
        setLoadError(json.error || "Invite not found.");
        return;
      }
      setInvite(json.invite);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function accept(opts?: { name?: string; password?: string }) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/invite/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: opts?.name,
          password: opts?.password,
        }),
      });
      let json: {
        error?: string;
        code?: string;
        createdAccount?: boolean;
        ok?: boolean;
      } = {};
      try {
        json = (await res.json()) as typeof json;
      } catch {
        setError(
          res.ok
            ? "We couldn’t join the team. Please try again."
            : "We couldn’t join the team. Please try again.",
        );
        return;
      }
      if (!res.ok) {
        setError(json.error || "We couldn’t join the team. Please try again.");
        return;
      }

      if (json.createdAccount && opts?.password && invite) {
        await rememberLoginCredentials({
          email: invite.email,
          password: opts.password,
        });
        const signInResult = await signIn("credentials", {
          email: invite.email,
          password: opts.password,
          redirect: false,
        });
        if (signInResult?.error) {
          setDone(true);
          setError("Account created — please sign in to open the CRM.");
          return;
        }
      } else if (opts?.password && invite) {
        await rememberLoginCredentials({
          email: invite.email,
          password: opts.password,
        });
        const signInResult = await signIn("credentials", {
          email: invite.email,
          password: opts.password,
          redirect: false,
        });
        if (signInResult?.error) {
          setDone(true);
          setError("Password set — please sign in to open the CRM.");
          return;
        }
      } else {
        // Refresh JWT so role flips from BUYER → AGENT immediately.
        await update({ refreshProfile: true });
      }

      setDone(true);
      router.refresh();
      window.setTimeout(() => {
        staffHardNavigate("/agent");
      }, 400);
    } catch {
      setError("We couldn’t join the team. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-line bg-surface p-6 text-center">
        <h1 className="font-display text-2xl text-ink">Invite unavailable</h1>
        <p className="mt-2 text-sm text-ink/60">{loadError}</p>
        <Link
          href="/auth/sign-in"
          className="mt-4 inline-block text-sm font-semibold text-canopy hover:underline"
        >
          Sign in
        </Link>
      </div>
    );
  }

  if (!invite) {
    return (
      <p className="py-16 text-center text-sm text-ink/50">Loading invite…</p>
    );
  }

  if (invite.accepted || done) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-line bg-surface p-6 text-center">
        <h1 className="font-display text-2xl text-ink">You’re on the team</h1>
        <p className="mt-2 text-sm text-ink/60">
          Your agent CRM is active
          {invite.convertsConsumerAccount
            ? "; buyer/seller dashboards are disabled for this account"
            : ""}
          . Open the CRM to get started with {invite.orgName}.
        </p>
        <Button className="mt-5" onClick={() => staffHardNavigate("/agent")}>
          Open CRM
        </Button>
      </div>
    );
  }

  if (invite.expired) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-line bg-surface p-6 text-center">
        <h1 className="font-display text-2xl text-ink">Invite expired</h1>
        <p className="mt-2 text-sm text-ink/60">
          Ask your team leader to send a new invite to {invite.email}.
        </p>
      </div>
    );
  }

  const signInHref = `/auth/sign-in?callbackUrl=${encodeURIComponent(`/auth/invite/${token}`)}`;
  const convertBanner = invite.convertsConsumerAccount ? (
    <div className="mt-4 rounded-lg border border-[#fdba74] bg-[#fff7ed] px-3 py-2.5 text-[12px] leading-relaxed text-[#9a3412]">
      <strong>Profile change:</strong> accepting this invite disables your{" "}
      {consumerLabelText(invite.consumerLabels)} profile and activates your
      agent CRM at <strong>/agent</strong>.
    </div>
  ) : null;

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-canopy">
        Team invite
      </p>
      <h1 className="mt-1 font-display text-2xl tracking-tight text-ink">
        Join {invite.orgName}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-ink/60">
        {invite.invitedByName
          ? `${invite.invitedByName} invited you`
          : "You’ve been invited"}{" "}
        as <strong className="text-ink">{roleLabel(invite.role)}</strong> ·{" "}
        {invite.email}
      </p>
      <p className="mt-1 text-xs text-ink/45">
        Expires{" "}
        {new Date(invite.expiresAt).toLocaleDateString("en-CA", {
          year: "numeric",
          month: "short",
          day: "numeric",
        })}
      </p>
      {convertBanner}

      {invite.accountExists && invite.needsPasswordActivation ? (
        <form
          className="mt-6 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void accept({ password });
          }}
        >
          <p className="text-sm text-ink/65">
            Your workspace seat is ready. Create a password to activate HouzzatPro
            login for {invite.email}. Professional and contact information was
            already entered by your workspace admin.
          </p>
          {invite.profilePrefilled ? (
            <AdminFilledProfile invite={invite} />
          ) : null}
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="invite-email">
              Email
            </label>
            <Input
              id="invite-email"
              type="email"
              value={invite.email}
              disabled
              readOnly
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="invite-password">
              Password
            </label>
            <Input
              id="invite-password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Activating…" : "Set password & open CRM"}
          </Button>
        </form>
      ) : invite.accountExists ? (
        <div className="mt-6 space-y-3">
          <p className="text-sm text-ink/65">
            An account already exists for this email. Sign in, then accept the
            invite
            {invite.convertsConsumerAccount
              ? " to switch this account to agent mode"
              : ""}
            .
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={pending}
              onClick={() => void accept()}
            >
              {pending ? "Joining…" : "Accept invite"}
            </Button>
            <Link
              href={signInHref}
              className="inline-flex items-center rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink/70 hover:bg-mist"
            >
              Sign in first
            </Link>
          </div>
        </div>
      ) : (
        <form
          className="mt-6 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void accept(
              invite.profilePrefilled
                ? { password }
                : { name, password },
            );
          }}
        >
          <p className="text-sm text-ink/65">
            {invite.profilePrefilled
              ? "Your professional and contact information is already on file. Create a password to join the team."
              : "Create your agent account to join the team. Your email is fixed to this invite."}
          </p>
          {invite.profilePrefilled ? (
            <AdminFilledProfile invite={invite} />
          ) : (
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="invite-name">
                Full name
              </label>
              <Input
                id="invite-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="invite-email">
              Email
            </label>
            <Input
              id="invite-email"
              type="email"
              value={invite.email}
              disabled
              readOnly
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="invite-password">
              Password
            </label>
            <Input
              id="invite-password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <p className="text-[11px] text-ink/45">
            By creating an account you agree to Houzzat’s{" "}
            <a href="/terms" className="underline underline-offset-2">
              Terms
            </a>{" "}
            and{" "}
            <a href="/privacy" className="underline underline-offset-2">
              Privacy Policy
            </a>
            .
          </p>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Creating account…" : "Create account & join team"}
          </Button>
        </form>
      )}

      {error ? (
        <p className="mt-3 text-xs text-[#b91c1c]">
          {error}{" "}
          {error.includes("Sign in") ? (
            <Link href={signInHref} className="font-semibold underline">
              Sign in
            </Link>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

function AdminFilledProfile({ invite }: { invite: InviteClientPreview }) {
  const expiry = invite.recoLicenseExpiresAt
    ? new Date(`${invite.recoLicenseExpiresAt}T12:00:00.000Z`).toLocaleDateString(
        "en-CA",
        { year: "numeric", month: "short", day: "numeric" },
      )
    : null;
  return (
    <div className="rounded-xl border border-line bg-mist/40 px-3 py-3 text-sm text-ink/70">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-canopy">
        Entered by your admin
      </p>
      <p className="mt-1 font-medium text-ink">
        {[invite.firstName, invite.lastName].filter(Boolean).join(" ") || invite.email}
      </p>
      {invite.phone ? <p className="mt-0.5 text-xs">{invite.phone}</p> : null}
      {invite.recoLicenseNumber ? (
        <p className="mt-0.5 text-xs">
          RECO {invite.recoLicenseNumber}
          {expiry ? ` · expires ${expiry}` : ""}
        </p>
      ) : null}
    </div>
  );
}
