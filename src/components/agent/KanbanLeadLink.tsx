"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  isLeadsDeskPath,
  replaceLeadQueryParam,
} from "@/lib/agent/lead-profile-query";

/** Kanban card link — uses History API when already on the leads desk. */
export function KanbanLeadLink({
  href,
  leadId,
  className,
  children,
}: {
  href: string;
  leadId: string;
  className?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <Link
      href={href}
      prefetch={false}
      className={className}
      onClick={(event) => {
        if (!isLeadsDeskPath(pathname)) return;
        event.preventDefault();
        replaceLeadQueryParam(leadId);
      }}
    >
      {children}
    </Link>
  );
}
