"use client";

import { useEffect, useRef, useState } from "react";
import { getSession, signIn } from "next-auth/react";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  hadClientSession,
  loadRememberedLogin,
  rememberLoginCredentials,
} from "@/lib/auth/remembered-login";
import { hardGo } from "@/lib/mobile/nav-back";
import { offerBiometricsAfterCredentialsSignIn } from "@/lib/mobile/offer-biometrics-opt-in";
import { clearIntentionalSignOut } from "@/lib/mobile/biometrics";
import {
  HOUZZATPRO_STAFF_ONLY_PATH,
  HOUZZATPRO_START_PATH,
} from "@/lib/mobile/app-shell";
import { isAdminRole, isAgentRole } from "@/lib/roles";

function safeCallbackPath(callbackUrl: string | null) {
  if (
    !callbackUrl ||
    !callbackUrl.startsWith("/") ||
    callbackUrl.startsWith("//")
  ) {
    return HOUZZATPRO_START_PATH;
  }
  if (callbackUrl.startsWith("/auth")) {
    return HOUZZATPRO_START_PATH;
  }
  return callbackUrl;
}

function resolvePostSignInHref(callbackUrl: string | null, role?: string) {
  const target = safeCallbackPath(callbackUrl);
  if (
    target === HOUZZATPRO_START_PATH ||
    target.startsWith("/pro") ||
    target.startsWith("/admin") ||
    target.startsWith("/agent")
  ) {
    if (isAdminRole(role)) return "/admin";
    if (isAgentRole(role)) return "/agent";
    return HOUZZATPRO_STAFF_ONLY_PATH;
  }
  return target;
}

export function HouzzatProSignInForm({
  callbackUrl = null,
}: {
  callbackUrl?: string | null;
}) {
  const { confirm } = useSiteAlert();
  const submitRef = useRef<HTMLButtonElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [loginAgain, setLoginAgain] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const remembered = await loadRememberedLogin();
      if (cancelled || !remembered) {
        if (!cancelled) setLoginAgain(hadClientSession());
        return;
      }
      setEmail(remembered.email);
      if (remembered.password) setPassword(remembered.password);
      setLoginAgain(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const normalizedEmail = email.trim().toLowerCase();
    const result = await signIn("credentials", {
      email: normalizedEmail,
      password,
      redirect: false,
    });

    if (result?.error) {
      setPending(false);
      if (result.error === "Configuration") {
        setError("Sign-in is temporarily unavailable. Please try again shortly.");
      } else {
        setError("Invalid email or password.");
      }
      return;
    }

    await rememberLoginCredentials({ email: normalizedEmail, password });
    const session = await getSession();
    await clearIntentionalSignOut();
    await offerBiometricsAfterCredentialsSignIn({
      email: normalizedEmail,
      password,
      confirm,
    });

    setPending(false);
    hardGo(resolvePostSignInHref(callbackUrl, session?.user?.role));
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
          Registered Email
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
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="h-12 border-white/70 bg-white/95 text-ink shadow-sm backdrop-blur-sm focus-visible:border-[#0B5C49]/35 focus-visible:ring-[#0B5C49]/25"
        />
      </div>
      <div className="space-y-2">
        <label
          className="text-sm font-medium text-[#0B5C49]/90"
          htmlFor="pro-signin-password"
        >
          Password
        </label>
        <Input
          id="pro-signin-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="h-12 border-white/70 bg-white/95 text-ink shadow-sm backdrop-blur-sm focus-visible:border-[#0B5C49]/35 focus-visible:ring-[#0B5C49]/25"
        />
      </div>
      {error ? <p className="text-sm font-medium text-danger">{error}</p> : null}
      <Button
        type="submit"
        ref={submitRef}
        disabled={pending}
        className="h-12 w-full bg-[#0B5C49] text-base font-semibold text-white hover:bg-[#094a3b]"
      >
        {pending ? "Signing in…" : loginAgain ? "Sign in again" : "Sign in"}
      </Button>
      <p className="text-center text-xs leading-relaxed text-[#0B5C49]/65">
        Contact Houzzat support for assistance
      </p>
    </form>
  );
}
