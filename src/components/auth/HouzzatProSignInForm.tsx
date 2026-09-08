"use client";

import { useRef, useState } from "react";
import { getSession } from "next-auth/react";
import { Eye, EyeOff } from "lucide-react";
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
  const [showPassword, setShowPassword] = useState(false);
  const [loginAgain] = useState(() => loadProSignInEmailPrefill().loginAgain);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);

    const normalizedEmail = email.trim().toLowerCase();
    setNativeNavStage("BOOTSTRAPPING");

    const result = await proNativeAuthController.submitCredentials({
      email: normalizedEmail,
      password,
      callbackUrl,
      returnPath,
      workspaceHint,
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
          className="h-12 border-white/70 bg-white/95 text-ink shadow-sm backdrop-blur-sm placeholder:text-ink/40 focus-visible:border-[#0B5C49]/35 focus-visible:ring-[#0B5C49]/25"
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
            placeholder="Enter Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-12 border-white/70 bg-white/95 pr-11 text-ink shadow-sm backdrop-blur-sm placeholder:text-ink/40 focus-visible:border-[#0B5C49]/35 focus-visible:ring-[#0B5C49]/25"
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
