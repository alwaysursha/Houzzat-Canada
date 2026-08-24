"use client";

import { useRef, useState } from "react";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import {
  channelLabel,
  type StaffCategoryChannel,
  type StaffNotificationCategory,
} from "@/lib/notifications/staff-categories";
import { cn } from "@/lib/utils";

export type StaffCategoryToggleItem = {
  id: StaffNotificationCategory;
  label: string;
  description: string;
  highStakes: boolean;
  emailActive: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
};

type PendingKey = `${StaffNotificationCategory}:${StaffCategoryChannel}`;

function toastMessage(
  label: string,
  channel: StaffCategoryChannel,
  enabled: boolean,
): string {
  const ch = channel === "push" ? "push" : "email";
  return enabled
    ? `${label} ${ch} notifications enabled.`
    : `${label} ${ch} notifications turned off.`;
}

export function StaffNotificationPreferencesForm({
  categories: initial,
  intro,
}: {
  categories: StaffCategoryToggleItem[];
  intro: string;
}) {
  const { confirm, toast } = useSiteAlert();
  const [categories, setCategories] = useState(initial);
  const [pending, setPending] = useState<PendingKey | null>(null);
  const requestGen = useRef(0);

  async function applyToggle(
    categoryId: StaffNotificationCategory,
    channel: StaffCategoryChannel,
    enabled: boolean,
  ) {
    const key: PendingKey = `${categoryId}:${channel}`;
    const previous = categories;
    const gen = ++requestGen.current;

    setCategories((curr) =>
      curr.map((item) => {
        if (item.id !== categoryId) return item;
        if (channel === "push") return { ...item, pushEnabled: enabled };
        return { ...item, emailEnabled: enabled };
      }),
    );
    setPending(key);

    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: categoryId, channel, enabled }),
      });
      if (gen !== requestGen.current) return;

      if (!res.ok) {
        setCategories(previous);
        toast({
          message: "Couldn’t update notification preferences. Please try again.",
          tone: "error",
        });
        return;
      }

      const json = (await res.json()) as {
        categories?: StaffCategoryToggleItem[];
      };
      if (gen !== requestGen.current) return;
      if (json.categories) setCategories(json.categories);

      const label =
        previous.find((item) => item.id === categoryId)?.label ?? "Notifications";
      toast({
        message: toastMessage(label, channel, enabled),
        tone: "success",
      });
    } catch {
      if (gen !== requestGen.current) return;
      setCategories(previous);
      toast({
        message: "Couldn’t update notification preferences. Please try again.",
        tone: "error",
      });
    } finally {
      if (gen === requestGen.current) setPending(null);
    }
  }

  async function onToggle(
    item: StaffCategoryToggleItem,
    channel: StaffCategoryChannel,
    enabled: boolean,
  ) {
    if (pending) return;

    if (!enabled && item.highStakes) {
      const ch = channelLabel(channel);
      const other =
        channel === "push"
          ? "Email notifications will remain unchanged."
          : "Push notifications will remain unchanged.";
      const ok = await confirm({
        title: `Turn off ${item.label} ${ch} notifications?`,
        message: `You will no longer receive ${ch} alerts for ${item.label.toLowerCase()}. ${other}`,
        confirmLabel: "Turn off",
        cancelLabel: "Cancel",
        destructive: true,
      });
      if (!ok) return;
    }

    await applyToggle(item.id, channel, enabled);
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-ink/60">{intro}</p>
      <ul className="space-y-3">
        {categories.map((item) => {
          const pushPending = pending === `${item.id}:push`;
          const emailPending = pending === `${item.id}:email`;
          return (
            <li
              key={item.id}
              className="overflow-hidden rounded-2xl border border-line/90 bg-surface shadow-[0_12px_32px_-28px_rgba(15,40,30,0.45)]"
            >
              <div className="border-b border-line/70 px-4 py-3.5 sm:px-5">
                <h2 className="text-[15px] font-semibold tracking-tight text-ink">
                  {item.label}
                </h2>
                <p className="mt-1 text-[13px] leading-snug text-ink/55">
                  {item.description}
                </p>
              </div>
              <div className="divide-y divide-line/70">
                <ChannelRow
                  label="Push"
                  hint="HouzzatPro lock-screen alerts"
                  enabled={item.pushEnabled}
                  pending={pushPending}
                  disabled={Boolean(pending) && !pushPending}
                  onChange={(next) => void onToggle(item, "push", next)}
                />
                <ChannelRow
                  label="Email"
                  hint={
                    item.emailActive
                      ? "Desk email alerts for this category"
                      : "Saved for when email alerts are available"
                  }
                  enabled={item.emailEnabled}
                  pending={emailPending}
                  disabled={Boolean(pending) && !emailPending}
                  muted={!item.emailActive}
                  onChange={(next) => void onToggle(item, "email", next)}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ChannelRow({
  label,
  hint,
  enabled,
  pending,
  disabled,
  muted,
  onChange,
}: {
  label: string;
  hint: string;
  enabled: boolean;
  pending: boolean;
  disabled: boolean;
  muted?: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 px-4 py-3.5 sm:px-5",
        muted && "bg-mist/25",
        pending && "opacity-70",
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{label}</p>
        <p className="mt-0.5 text-[12px] leading-snug text-ink/50">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={`${label} notifications ${enabled ? "on" : "off"}`}
        disabled={disabled || pending}
        onClick={() => onChange(!enabled)}
        className={cn(
          "relative inline-flex h-11 w-[3.25rem] shrink-0 items-center rounded-full border transition",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-canopy",
          enabled
            ? "border-canopy/30 bg-canopy"
            : "border-line bg-mist",
          (disabled || pending) && "cursor-not-allowed opacity-60",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute left-1 size-9 rounded-full bg-white shadow transition-transform",
            enabled && "translate-x-[1.15rem]",
          )}
        />
      </button>
    </div>
  );
}
