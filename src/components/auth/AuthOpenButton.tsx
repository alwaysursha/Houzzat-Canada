"use client";

import { useAuthModal, type AuthMode } from "@/components/auth/AuthModalProvider";
import { cn } from "@/lib/utils";

export function AuthOpenButton({
  mode = "sign-in",
  callbackUrl,
  className,
  children,
  onClick,
}: {
  mode?: AuthMode;
  callbackUrl?: string;
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  const { openAuth } = useAuthModal();

  return (
    <button
      type="button"
      className={cn(className)}
      onClick={() => {
        onClick?.();
        openAuth({ mode, callbackUrl });
      }}
    >
      {children}
    </button>
  );
}
