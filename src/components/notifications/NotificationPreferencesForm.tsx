"use client";

import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { useSession } from "next-auth/react";
import { enablePushFromSettings } from "@/lib/notifications/push-client";
import { cn } from "@/lib/utils";

export type NotificationToggleItem = {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
};

export function NotificationPreferencesForm({
  items: initialItems,
  intro,
  showDeviceActions = false,
}: {
  items: NotificationToggleItem[];
  intro: string;
  /** Consumer Account → Notifications: enable OS permission + test push. */
  showDeviceActions?: boolean;
}) {
  const { data } = useSession();
  const userId = data?.user?.id;
  const [items, setItems] = useState(initialItems);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deviceBusy, setDeviceBusy] = useState(false);
  const native = Capacitor.isNativePlatform();

  async function toggle(id: string, enabled: boolean) {
    const previous = items;
    setItems((curr) =>
      curr.map((item) => (item.id === id ? { ...item, enabled } : item)),
    );
    setPendingId(id);
    setMessage(null);
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefs: { [id]: enabled } }),
      });
      if (!res.ok) {
        setItems(previous);
        setMessage("Could not save. Try again.");
        return;
      }
      setMessage("Saved.");
    } catch {
      setItems(previous);
      setMessage("Could not save. Try again.");
    } finally {
      setPendingId(null);
    }
  }

  async function onEnableDevice() {
    setDeviceBusy(true);
    setMessage(null);
    try {
      const result = await enablePushFromSettings(userId);
      if (result === "registered") {
        setMessage("Phone alerts enabled for this device.");
      } else if (result === "denied") {
        setMessage(
          "Notifications are off in system settings. Enable them for Houzzat, then try again.",
        );
      } else {
        setMessage("Could not enable alerts on this device.");
      }
    } catch {
      setMessage("Could not enable alerts on this device.");
    } finally {
      setDeviceBusy(false);
    }
  }

  async function onSendTest() {
    setDeviceBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/notifications/test", { method: "POST" });
      const json = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (res.status === 429) {
        setMessage(json?.error ?? "Wait a minute before another test.");
        return;
      }
      if (!res.ok) {
        setMessage(json?.error ?? "Could not send test notification.");
        return;
      }
      setMessage("Test notification sent. Check the notification tray.");
    } catch {
      setMessage("Could not send test notification.");
    } finally {
      setDeviceBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink/60">{intro}</p>
      {showDeviceActions && native ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-line bg-mist/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] leading-snug text-ink/65">
            Allow Houzzat to send lock-screen alerts on this phone, then verify
            with a test notification.
          </p>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              disabled={deviceBusy}
              onClick={() => void onEnableDevice()}
              className="rounded-xl border border-line bg-surface px-3 py-2 text-sm font-semibold text-ink transition hover:border-canopy/40 hover:text-canopy disabled:opacity-60"
            >
              Enable on this phone
            </button>
            <button
              type="button"
              disabled={deviceBusy}
              onClick={() => void onSendTest()}
              className="rounded-xl bg-canopy px-3 py-2 text-sm font-semibold text-white transition hover:bg-canopy/90 disabled:opacity-60"
            >
              Send test notification
            </button>
          </div>
        </div>
      ) : null}
      <ul className="divide-y divide-line/80 overflow-hidden rounded-2xl border border-line bg-surface">
        {items.map((item) => (
          <li key={item.id}>
            <label
              className={cn(
                "flex cursor-pointer items-start gap-3 px-4 py-3.5",
                pendingId === item.id && "opacity-70",
              )}
            >
              <input
                type="checkbox"
                className="mt-1 size-4 rounded border-line text-canopy focus:ring-canopy"
                checked={item.enabled}
                disabled={pendingId === item.id}
                onChange={(e) => void toggle(item.id, e.target.checked)}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">
                  {item.label}
                </span>
                <span className="mt-0.5 block text-[13px] leading-snug text-ink/55">
                  {item.description}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {message ? (
        <p className="text-sm text-canopy" aria-live="polite">
          {message}
        </p>
      ) : null}
    </div>
  );
}
