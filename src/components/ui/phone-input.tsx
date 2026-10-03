"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";

export type PhoneInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type"
>;

/**
 * Explicit phone field. Same mask as `Input type="tel"` — (647) 221 - 4949.
 */
export const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  (props, ref) => <Input {...props} ref={ref} type="tel" />,
);
PhoneInput.displayName = "PhoneInput";
