"use client";

import { useRef, useState } from "react";
import { getSession } from "next-auth/react";
import { ForgotPasswordRequest } from "@/components/auth/ForgotPasswordRequest";
import { PasswordField } from "@/components/auth/PasswordField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  clearManualSignInRequired,
  loadProSignInEmailPrefill,
  rememberLoginCredentials,
} from "@/lib/auth/remembered-login";
import { clearIntentionalSignOut } from "@/lib/mobile/biometrics";
import { setNativeNavStage } from "@/lib/mobile/native-route-latch";
import { proNativeAuthController } from "@/lib/mobile/pro-native-auth-controller";
import { BOOK_DEMO_PATH } from "@/lib/platform/public/book-demo-copy";
import { HOUZZATPRO_PLATFORM_URL } from "@/lib/tenancy/platform-footer";

const PRO_BOOK_DEMO_HREF = `${HOUZZATPRO_PLATFORM_URL}${BOOK_DEMO_PATH}`;

const PRO_INPUT_CLASS =
  "h-12 border-white/70 bg-white/95 text-ink shadow-sm backdrop-blur-sm placeholder:text-ink/40 focus-visible:border-[#0B5C49]/35 focus-visible:ring-[#0B5C49]/25";

type WorkspaceChoice = {
  workspaceId: string;
  displayName: string;
  slug: string;
};

export function HouzzatProSignInForm({
  callbackUrl = null,
  returnPath = null,
  workspaceHint = null,
}: {
  callbackUrl?: string | null;
  returnPath?: string | null;
  workspaceHint?: string | null;
}) {
  const submitRef = useRef<HTMLButtonElement>(null);
  const [email, setEmail] = useState(() => loadProSignInEmailPrefill().email);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [forgotPassword, setForgotPassword] = useState(false);
  const [workspaceChoices, setWorkspaceChoices] = useState<WorkspaceChoice[] | null>(
    null,
  );
  const [loginAgain] = useState(() => loadProSignInEmailPrefill().loginAgain);

  async function completeSignIn(selectedWorkspaceId: string | null) {
    const normalizedEmail = email.trim().toLowerCase();
    setNativeNavStage("BOOTSTRAPPING");

    const result = await proNativeAuthController.submitCredentials({
      email: normalizedEmail,
      password,
      callbackUrl,
      returnPath,
      workspaceHint: selectedWorkspaceId ?? workspaceHint,
    });

    if (!result.ok) {
      setPending(false);
      setError(result.error ?? "Invalid email or password.");
      return;
    }

    clearManualSignInRequired();
    void rememberLoginCredentials({ email: normalizedEmail, password });
    void getSession().then((session) => {
      if (session?.user?.id) {
        void clearIntentionalSignOut({ userId: session.user.id });
      }
    });
    // Navigation should hardGo away; clear pending if we remain on this page.
    window.setTimeout(() => {
      setPending(false);
    }, 4_000);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);

    const normalizedEmail = email.trim().toLowerCase();

    // Password-proven multi-workspace selection (same email, independent identities).
    if (!workspaceHint) {
      try {
        const discoverRes = await fetch("/api/mobile/v2/auth/discover", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ email: normalizedEmail, password }),
        });
        const discoverBody = (await discoverRes.json().catch(() => null)) as {
          ok?: boolean;
          data?: { matches?: WorkspaceChoice[] };
        } | null;
        if (
          discoverRes.ok &&
          discoverBody?.ok &&
          Array.isArray(discoverBody.data?.matches)
        ) {
          const matches = discoverBody.data!.matches!;
          if (matches.length > 1) {
            setWorkspaceChoices(matches);
            setPending(false);
            return;
          }
          if (matches.length === 1) {
            await completeSignIn(matches[0]!.workspaceId);
            return;
          }
        }
      } catch {
        /* fall through to credentials (PlatformOperator path) */
      }
    }

    await completeSignIn(null);
  }

  async function onSelectWorkspace(workspaceId: string) {
    if (pending) return;
    setPending(true);
    setError(null);
    setWorkspaceChoices(null);
    await completeSignIn(workspaceId);
  }

  if (forgotPassword) {
    return (
      <ForgotPasswordRequest
        initialEmail={email}
        workspaceHint={workspaceHint}
        onBack={() => setForgotPassword(false)}
      />
    );
  }

  if (workspaceChoices && workspaceChoices.length > 1) {
    return (
      <div className="space-y-4">
        <div className="space-y-1.5">
          <h3 className="text-lg font-semibold text-[#0B5C49]">
            Choose a workspace
          </h3>
          <p className="text-sm text-[#0B5C49]/75">
            This email belongs to more than one HouzzatPRO workspace. Select
            where you want to sign in.
          </p>
        </div>
        <ul className="space-y-2">
          {workspaceChoices.map((choice) => (
            <li key={choice.workspaceId}>
              <button
                type="button"
                disabled={pending}
                onClick={() => void onSelectWorkspace(choice.workspaceId)}
                className="flex h-12 w-full items-center justify-between rounded-xl border border-[#0B5C49]/20 bg-white px-4 text-left text-sm font-semibold text-[#0B5C49] transition hover:border-[#0B5C49]/45 hover:bg-[#F4FBF8] disabled:opacity-60"
              >
                <span>{choice.displayName}</span>
                <span className="text-xs font-medium text-[#0B5C49]/55">
                  {choice.slug}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {error ? <p className="text-sm font-medium text-danger">{error}</p> : null}
        <button
          type="button"
          onClick={() => {
            setWorkspaceChoices(null);
            setPending(false);
          }}
          className="w-full text-center text-sm font-semibold text-[#0B5C49] hover:underline"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4"
      autoComplete="on"
      name="houzzatpro-signin"
    >
      <div className="space-y-2">
        <label
          className="text-sm font-medium text-[#0B5C49]/90"
          htmlFor="pro-signin-email"
        >
          Pro Member Login
        </label>
        <Input
          id="pro-signin-email"
          name="username"
          type="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          placeholder="Enter Email Address"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={PRO_INPUT_CLASS}
        />
      </div>
      <PasswordField
        id="pro-signin-password"
        name="password"
        label="Password"
        autoComplete="current-password"
        required
        placeholder="Enter Password"
        value={password}
        onChange={setPassword}
        labelClassName="text-[#0B5C49]/90"
        inputClassName={PRO_INPUT_CLASS}
        accessory={
          <button
            type="button"
            onClick={() => setForgotPassword(true)}
            className="text-sm font-semibold text-[#0B5C49] hover:underline"
          >
            Forgot your password?
          </button>
        }
      />
      {error ? <p className="text-sm font-medium text-danger">{error}</p> : null}
      <Button
        type="submit"
        ref={submitRef}
        disabled={pending}
        className="h-12 w-full bg-[#0B5C49] text-base font-semibold text-white hover:bg-[#094a3b]"
      >
        {pending ? "Signing in…" : loginAgain ? "Sign in again" : "Sign in"}
      </Button>

      <div className="space-y-3 border-t border-[#0B5C49]/15 pt-4 text-center">
        <p className="text-sm text-[#0B5C49]/75">
          Not a HouzzatPRO member yet?
        </p>
        <a
          href={PRO_BOOK_DEMO_HREF}
          className="inline-flex h-12 w-full items-center justify-center rounded-xl border-2 border-[#0B5C49]/25 bg-white text-base font-semibold text-[#0B5C49] shadow-[0_8px_24px_rgba(11,92,73,0.12)] transition hover:border-[#0B5C49]/45 hover:bg-[#F4FBF8] hover:shadow-[0_10px_28px_rgba(11,92,73,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B5C49]/35"
        >
          Book a Demo
        </a>
      </div>

      <p className="text-center text-xs leading-relaxed text-[#0B5C49]/65">
        Contact Houzzatpro support for assistance
      </p>
    </form>
  );
}
