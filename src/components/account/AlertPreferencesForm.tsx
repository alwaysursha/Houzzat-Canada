"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Account SMS / phone settings. Email controls live on the Communication
 * Preference Center (`/preferences/email`) to avoid duplicate global toggles.
 */
export function AlertPreferencesForm({
  smsAlertsEnabled,
  phone,
}: {
  smsAlertsEnabled: boolean;
  phone: string | null;
}) {
  const router = useRouter();
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
    <div className="space-y-5">
      <div className="rounded-2xl border border-canopy/20 bg-canopy/5 p-5">
        <h2 className="font-semibold text-ink">Communication Preferences</h2>
        <p className="mt-1 text-sm text-ink/60">
          Manage optional email categories, unsubscribe / resume, and push
          notifications in one place.
        </p>
        <Link
          href="/preferences/email"
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-canopy px-4 text-sm font-semibold text-white transition hover:bg-canopy/90"
        >
          Open Communication Preferences
        </Link>
      </div>

      <div className="space-y-4 rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-semibold text-ink">Phone &amp; SMS</h2>
        <p className="text-sm text-ink/60">
          SMS is separate from email and push. Email alerts are managed in
          Communication Preferences.
        </p>
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={smsOn}
            onChange={(e) => setSmsOn(e.target.checked)}
          />
          SMS alerts
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
          {pending ? "Saving…" : "Save phone & SMS"}
        </Button>
      </div>
    </div>
  );
}
