"use client";

import { useEffect } from "react";
import { CustomerProfile } from "@/components/agent/CustomerProfile";
import {
  STAFF_OVERLAY_PRIORITY,
  useStaffOverlay,
} from "@/lib/mobile/use-staff-overlay";

export function LeadQuickPopup({
  leadId,
  leadIds,
  onClose,
  onNavigate,
}: {
  leadId: string;
  /** Ordered list for previous / next. */
  leadIds?: string[];
  onClose: () => void;
  onNavigate?: (leadId: string) => void;
}) {
  useStaffOverlay({
    open: true,
    id: `lead-quick-popup:${leadId}`,
    priority: STAFF_OVERLAY_PRIORITY.leadPopup,
    onClose,
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (!leadIds?.length || !onNavigate) return;
      const index = leadIds.indexOf(leadId);
      if (index < 0) return;
      if (e.key === "ArrowLeft" && index > 0) {
        e.preventDefault();
        onNavigate(leadIds[index - 1]!);
      }
      if (e.key === "ArrowRight" && index < leadIds.length - 1) {
        e.preventDefault();
        onNavigate(leadIds[index + 1]!);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, onNavigate, leadId, leadIds]);

  return (
    <div className="fixed inset-0 z-[90] flex items-stretch justify-end p-0 sm:p-3 sm:pl-14 lg:p-5 lg:pl-16">
      <button
        type="button"
        className="absolute inset-0 bg-[#1e2a38]/55 backdrop-blur-[2px] sm:bg-[#1e2a38]/45 sm:backdrop-blur-[1px]"
        aria-label="Close customer profile"
        onClick={onClose}
      />
      <div className="relative z-10 flex h-full w-full max-w-[1280px] items-stretch pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] sm:pb-0 sm:pt-0">
        <CustomerProfile
          key={leadId}
          leadId={leadId}
          variant="modal"
          leadIds={leadIds}
          onClose={onClose}
          onNavigateLead={onNavigate}
        />
      </div>
    </div>
  );
}
