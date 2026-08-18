"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AlertPreferencesForm({
  emailAlertsEnabled,
  smsAlertsEnabled,
  phone,
}: {
  emailAlertsEnabled: boolean;
  smsAlertsEnabled: boolean;
  phone: string | null;
}) {
  const router = useRouter();
  const [emailOn, setEmailOn] = useState(emailAlertsEnabled);
  const [smsOn, setSmsOn] = useState(smsAlertsEnabled);
  const [phoneValue, setPhoneValue] = useState(phone ?? "");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setPending(true);
    setMessage(null);
    const res = await fetch("/api/account/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        emailAlertsEnabled: emailOn,
        smsAlertsEnabled: smsOn,
        phone: phoneValue || undefined,
      }),
    });
    setPending(false);
    if (!res.ok) {
      setMessage("Could not save preferences.");
      return;
    }
    setMessage("Preferences saved.");
    router.refresh();
  }

  return (
    <div className="space-y-4 rounded-2xl border border-line bg-surface p-5">
      <h2 className="font-semibold text-ink">Alert preferences</h2>
      <p className="text-sm text-ink/60">
        Email and SMS are separate from phone push. Manage lock-screen alerts in{" "}
        <a href="/account/notifications" className="font-semibold text-canopy hover:underline">
          Notifications
        </a>
        .
      </p>
      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={emailOn}
          onChange={(e) => setEmailOn(e.target.checked)}
        />
        Email alerts for saved searches & updates
      </label>
      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={smsOn}
          onChange={(e) => setSmsOn(e.target.checked)}
        />
        SMS alerts (Twilio wiring in Phase 3)
      </label>
      <div className="space-y-1">
        <label className="text-xs font-semibold uppercase tracking-wide text-ink/45">
          Mobile number
        </label>
        <Input
          value={phoneValue}
          onChange={(e) => setPhoneValue(e.target.value)}
          placeholder="+1 416 …"
        />
      </div>
      {message ? <p className="text-sm text-canopy">{message}</p> : null}
      <Button type="button" onClick={save} disabled={pending}>
        {pending ? "Saving…" : "Save preferences"}
      </Button>
    </div>
  );
}
