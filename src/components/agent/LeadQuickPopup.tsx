"use client";

import { useEffect } from "react";
import { CustomerProfile } from "@/components/agent/CustomerProfile";

export function LeadQuickPopup({
  leadId,
  onClose,
}: {
  leadId: string;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[90] flex items-stretch justify-end p-2 pl-10 sm:p-3 sm:pl-14 lg:p-5 lg:pl-16">
      <button
        type="button"
        className="absolute inset-0 bg-[#1e2a38]/45 backdrop-blur-[1px]"
        aria-label="Close customer profile"
        onClick={onClose}
      />
      <div className="relative z-10 flex h-full w-full max-w-[1280px] items-stretch">
        <CustomerProfile
          leadId={leadId}
          variant="modal"
          onClose={onClose}
        />
      </div>
    </div>
  );
}
