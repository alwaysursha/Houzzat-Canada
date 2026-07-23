"use client";

import { useState } from "react";
import { LeadRequestForm } from "@/components/listings/LeadRequestForm";
import {
  defaultViewingMessage,
  type ViewingContactDefaults,
} from "@/components/listings/ViewingBookingModal";

export function ViewingRequestPanel({
  mlsNumber,
  contact,
}: {
  mlsNumber: string;
  contact?: ViewingContactDefaults;
}) {
  const [mode, setMode] = useState<"showing" | "virtual_viewing">("showing");

  return (
    <div className="sticky top-[calc(4rem+var(--listing-sticky-bar-height,5.5rem)+0.5rem)] z-10 rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <h2 className="font-semibold text-ink">Book a viewing</h2>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
            mode === "showing"
              ? "bg-canopy text-white"
              : "border border-line text-ink/70"
          }`}
          onClick={() => setMode("showing")}
        >
          In-person
        </button>
        <button
          type="button"
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
            mode === "virtual_viewing"
              ? "bg-signal text-white"
              : "border border-line text-ink/70"
          }`}
          onClick={() => setMode("virtual_viewing")}
        >
          Virtual Viewing
        </button>
      </div>
      <div className="mt-4">
        <LeadRequestForm
          key={mode}
          mlsNumber={mlsNumber}
          kind={mode}
          defaults={{
            name: contact?.name ?? "",
            email: contact?.email ?? "",
            phone: contact?.phone ?? "",
            message: defaultViewingMessage(mlsNumber, mode),
          }}
        />
      </div>
    </div>
  );
}
