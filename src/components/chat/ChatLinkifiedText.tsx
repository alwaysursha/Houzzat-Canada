"use client";

import type { ReactNode } from "react";
import {
  chatExternalLinkProps,
  extractChatUrls,
  normalizeDetectedHref,
} from "@/lib/chat/link-preview";

/**
 * Renders message text with http(s) URLs as safe external links.
 */
export function ChatLinkifiedText({ text }: { text: string }) {
  const urls = extractChatUrls(text);
  if (urls.length === 0) {
    return <>{text}</>;
  }

  const parts: ReactNode[] = [];
  let cursor = 0;
  const re = /https?:\/\/[^\s<>"'`]+|www\.[^\s<>"'`]+/gi;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text)) != null) {
    const raw = match[0];
    const start = match.index;
    if (start > cursor) {
      parts.push(text.slice(cursor, start));
    }
    const href = normalizeDetectedHref(raw);
    if (href) {
      const props = chatExternalLinkProps(href);
      parts.push(
        <a
          key={`link-${key++}`}
          {...props}
          className="font-medium text-[#0f6b4c] underline decoration-[#0f6b4c]/35 underline-offset-2 hover:decoration-[#0f6b4c]"
        >
          {raw}
        </a>,
      );
    } else {
      parts.push(raw);
    }
    cursor = start + raw.length;
  }
  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }
  return <>{parts}</>;
}
