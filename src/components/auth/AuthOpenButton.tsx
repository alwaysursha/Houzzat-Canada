"use client";

import { useAuthModal, type AuthMode } from "@/components/auth/AuthModalProvider";
import { cn } from "@/lib/utils";

export function AuthOpenButton({
  mode = "sign-in",
  callbackUrl,
  className,
  children,
  onClick,
  ...rest
}: {
  mode?: AuthMode;
  callbackUrl?: string;
  className?: string;
  children: React.ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type">) {
  const { openAuth } = useAuthModal();

  return (
    <button
      type="button"
      className={cn(className)}
      onClick={(event) => {
        onClick?.(event);
        openAuth({ mode, callbackUrl });
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
