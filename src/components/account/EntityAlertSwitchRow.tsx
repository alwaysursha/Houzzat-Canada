"use client";

import { PreferenceSwitch } from "@/components/preferences/PreferenceSwitch";

export function EntityAlertSwitchRow({
  id,
  label,
  hint,
  checked,
  pending,
  disabled,
  onCheckedChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  pending?: boolean;
  disabled?: boolean;
  onCheckedChange: (next: boolean) => void;
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-sm font-medium text-ink">
          {label}
        </label>
        {hint ? <p className="mt-0.5 text-xs text-ink/50">{hint}</p> : null}
      </div>
      <PreferenceSwitch
        id={id}
        checked={checked}
        pending={pending}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        label={label}
      />
    </div>
  );
}
