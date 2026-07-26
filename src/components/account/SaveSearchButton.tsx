"use client";

import { useState } from "react";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SITE_MESSAGES } from "@/lib/site-messages";

export function SaveSearchButton({
  query,
  signedIn,
}: {
  query: Record<string, unknown>;
  signedIn: boolean;
}) {
  const { openAuth } = useAuthModal();
  const { toast } = useSiteAlert();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("My search");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function save() {
    if (!signedIn) {
      openAuth({ mode: "sign-in", callbackUrl: "/search" });
      return;
    }
    setPending(true);
    const res = await fetch("/api/saved-searches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, query, emailAlerts: true }),
    });
    setPending(false);
    if (!res.ok) {
      toast({ message: SITE_MESSAGES.genericErrorToast, tone: "error" });
      return;
    }
    setDone(true);
    setOpen(false);
    toast({ message: "Search saved to your account.", tone: "success" });
    window.dispatchEvent(new Event("houzzat:saved-searches-changed"));
  }

  if (done) {
    return (
      <p className="text-sm font-medium text-canopy">
        Search saved — manage alerts in your account.
      </p>
    );
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
      >
        Save this search
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-9 w-44"
        placeholder="Search name"
      />
      <Button type="button" size="sm" disabled={pending} onClick={save}>
        {pending ? "Saving…" : "Save"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => setOpen(false)}
      >
        Cancel
      </Button>
    </div>
  );
}
