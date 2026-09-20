"use client";

import { Input } from "@/components/ui/input";

export type AgentProfessionalFormValue = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  recoLicenseNumber: string;
  recoLicenseExpiresAt: string;
};

export function AgentProfessionalFields({
  value,
  onChange,
  disabled = false,
  readOnly = false,
  idPrefix,
}: {
  value: AgentProfessionalFormValue;
  onChange?: (next: AgentProfessionalFormValue) => void;
  disabled?: boolean;
  readOnly?: boolean;
  idPrefix: string;
}) {
  const locked = disabled || readOnly;

  function patch(partial: Partial<AgentProfessionalFormValue>) {
    onChange?.({ ...value, ...partial });
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field
        id={`${idPrefix}-first-name`}
        label="First name"
        required
        value={value.firstName}
        onChange={(firstName) => patch({ firstName })}
        disabled={locked}
        autoComplete="given-name"
      />
      <Field
        id={`${idPrefix}-last-name`}
        label="Last name"
        required
        value={value.lastName}
        onChange={(lastName) => patch({ lastName })}
        disabled={locked}
        autoComplete="family-name"
      />
      <Field
        id={`${idPrefix}-email`}
        label="Email"
        required
        type="email"
        value={value.email}
        onChange={(email) => patch({ email })}
        disabled={locked}
        autoComplete="email"
        className="sm:col-span-2"
      />
      <Field
        id={`${idPrefix}-phone`}
        label="Cell phone number"
        required
        type="tel"
        value={value.phone}
        onChange={(phone) => patch({ phone })}
        disabled={locked}
        autoComplete="tel"
        hint="Canada/US 10-digit or +E.164. This number is used for Agent SMS notifications."
      />
      <Field
        id={`${idPrefix}-reco`}
        label="RECO license #"
        required
        value={value.recoLicenseNumber}
        onChange={(recoLicenseNumber) => patch({ recoLicenseNumber })}
        disabled={locked}
      />
      <Field
        id={`${idPrefix}-reco-expiry`}
        label="RECO license expiry date"
        required
        type="date"
        value={value.recoLicenseExpiresAt}
        onChange={(recoLicenseExpiresAt) => patch({ recoLicenseExpiresAt })}
        disabled={locked}
        className="sm:col-span-2"
      />
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  required,
  type = "text",
  disabled,
  autoComplete,
  hint,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  disabled?: boolean;
  autoComplete?: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={className ? `space-y-1.5 ${className}` : "space-y-1.5"}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </label>
      <Input
        id={id}
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        readOnly={disabled}
        autoComplete={autoComplete}
      />
      {hint ? <p className="text-[11px] leading-relaxed text-ink/45">{hint}</p> : null}
    </div>
  );
}
