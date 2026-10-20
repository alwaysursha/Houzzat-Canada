"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";
import { ROYAL_COLLECTION_PREVIEW_ACTION_NOTE } from "./preview-action-note";

export function RoyalCollectionPreviewLink({
  href,
  className,
  children,
  disabled,
  onNavigate,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  disabled: boolean;
  onNavigate?: () => void;
}) {
  if (!disabled) {
    return (
      <Link href={href} className={className} onClick={onNavigate}>
        {children}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={className}
      aria-disabled="true"
      title={ROYAL_COLLECTION_PREVIEW_ACTION_NOTE}
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {children}
    </button>
  );
}
