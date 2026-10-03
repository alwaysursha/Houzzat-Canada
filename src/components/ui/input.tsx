"use client";

import * as React from "react";
import { formatPhoneAsYouType } from "@/lib/phone/format";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, value, defaultValue, onChange, ...props }, ref) => {
  const isTel = type === "tel";
  const isControlled = value !== undefined;
  const [telUncontrolled, setTelUncontrolled] = React.useState(() =>
    isTel
      ? formatPhoneAsYouType(
          typeof defaultValue === "string" || typeof defaultValue === "number"
            ? String(defaultValue)
            : "",
        )
      : "",
  );

  const telValue = isTel
    ? isControlled
      ? formatPhoneAsYouType(value == null ? "" : String(value))
      : telUncontrolled
    : undefined;

  return (
    <input
      type={type}
      className={cn(
        "flex h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canopy/35",
        className,
      )}
      ref={ref}
      {...props}
      {...(isTel
        ? {
            inputMode: props.inputMode ?? "tel",
            autoComplete: props.autoComplete ?? "tel",
            value: telValue,
            defaultValue: undefined,
            onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
              const next = formatPhoneAsYouType(event.target.value);
              if (!isControlled) setTelUncontrolled(next);
              const target = event.target;
              const prior = target.value;
              target.value = next;
              onChange?.(event);
              if (prior !== next) {
                const end = next.length;
                try {
                  target.setSelectionRange(end, end);
                } catch {
                  // ignore
                }
              }
            },
          }
        : { value, defaultValue, onChange })}
    />
  );
});
Input.displayName = "Input";
