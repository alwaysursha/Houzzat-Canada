"use client";

import { useState } from "react";
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
}: {
  items: NotificationToggleItem[];
  intro: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink/60">{intro}</p>
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
