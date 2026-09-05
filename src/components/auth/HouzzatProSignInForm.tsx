"use client";

import { useEffect, useRef, useState } from "react";
import { getSession, signIn } from "next-auth/react";
import { Eye, EyeOff } from "lucide-react";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  hadClientSession,
  loadRememberedLogin,
  rememberLoginCredentials,
} from "@/lib/auth/remembered-login";
import { clearIntentionalSignOut } from "@/lib/mobile/biometrics";
import { setNativeNavStage } from "@/lib/mobile/native-route-latch";
import { proNativeAuthController } from "@/lib/mobile/pro-native-auth-controller";
import { NativeAuthDiagnosticOverlay } from "@/components/mobile/NativeAuthDiagnosticOverlay";

export function HouzzatProSignInForm({
  callbackUrl = null,
  returnPath = null,
  workspaceHint = null,
}: {
  callbackUrl?: string | null;
  returnPath?: string | null;
  workspaceHint?: string | null;
}) {
  const { confirm } = useSiteAlert();
  const submitRef = useRef<HTMLButtonElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loginAgain, setLoginAgain] = useState(false);
  const [submitCount, setSubmitCount] = useState(0);
  const [lastSignInResult, setLastSignInResult] = useState<{
    ok?: boolean;
    error?: string | null;
  } | null>(null);

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
    if (pending) return;
    setPending(true);
    setError(null);
    setSubmitCount((prev) => prev + 1);

    const normalizedEmail = email.trim().toLowerCase();
    setNativeNavStage("BOOTSTRAPPING");

    const result = await proNativeAuthController.submitCredentials({
      email: normalizedEmail,
      password,
      callbackUrl,
      returnPath,
      workspaceHint,
    });

    setLastSignInResult(result);

    if (!result.ok) {
      setPending(false);
      setError(result.error ?? "Invalid email or password.");
      return;
    }

    void rememberLoginCredentials({ email: normalizedEmail, password });
    void getSession().then((session) => {
      if (session?.user?.id) {
        void clearIntentionalSignOut({ userId: session.user.id });
      }
    });
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
        <div className="relative">
          <Input
            id="pro-signin-password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-12 border-white/70 bg-white/95 pr-11 text-ink shadow-sm backdrop-blur-sm focus-visible:border-[#0B5C49]/35 focus-visible:ring-[#0B5C49]/25"
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-[#0B5C49]/60 transition-colors hover:text-[#0B5C49] focus:outline-none"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              <EyeOff className="size-5 stroke-[1.8]" />
            ) : (
              <Eye className="size-5 stroke-[1.8]" />
            )}
          </button>
        </div>
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
        Contact Houzzatpro support for assistance
      </p>

      <NativeAuthDiagnosticOverlay
        submitCount={submitCount}
        lastSignInResult={lastSignInResult}
      />
    </form>
  );
}
