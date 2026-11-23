"use client";

import { Input } from "@/components/ui/input";
import {
  designationOptionsForJurisdiction,
  licenseKindForJurisdiction,
  PROFESSIONAL_FIELD_LABELS,
  PROFESSIONAL_JURISDICTIONS,
  type ProfessionalFieldKey,
} from "@/lib/agent/professional-profile";

export type AgentProfessionalFormValue = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  designation: string;
  jurisdiction: string;
  recoLicenseNumber: string;
  recoLicenseExpiresAt: string;
  registrationNumber: string;
};

export function AgentProfessionalFields({
  value,
  onChange,
  disabled = false,
  readOnly = false,
  blockIncomplete = false,
  errors,
  idPrefix,
}: {
  value: AgentProfessionalFormValue;
  onChange?: (next: AgentProfessionalFormValue) => void;
  disabled?: boolean;
  readOnly?: boolean;
  /** Invite forms block submit until required controls are filled. Profile edits stay saveable. */
  blockIncomplete?: boolean;
  errors?: Partial<Record<ProfessionalFieldKey, string>>;
  idPrefix: string;
}) {
  const locked = disabled || readOnly;
  const licenseKind = licenseKindForJurisdiction(value.jurisdiction);
  const designationOptions = designationOptionsForJurisdiction(value.jurisdiction || null);
  const jurisdiction = PROFESSIONAL_JURISDICTIONS.find((item) => item.id === value.jurisdiction);

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
        error={errors?.firstName}
      />
      <Field
        id={`${idPrefix}-last-name`}
        label="Last name"
        required
        value={value.lastName}
        onChange={(lastName) => patch({ lastName })}
        disabled={locked}
        autoComplete="family-name"
        error={errors?.lastName}
      />
      <Field
        id={`${idPrefix}-email`}
        label="Professional email"
        required
        type="email"
        value={value.email}
        onChange={(email) => patch({ email })}
        disabled={locked}
        autoComplete="email"
        className="sm:col-span-2"
        error={errors?.email}
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
        hint="Formats as (647) 221 - 4949. Used for Agent SMS notifications."
        error={errors?.phone}
      />
      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-jurisdiction`} className="text-sm font-medium text-ink">
          Licensing jurisdiction
        </label>
        <select
          id={`${idPrefix}-jurisdiction`}
          disabled={locked}
          value={value.jurisdiction}
          onChange={(event) => patch({ jurisdiction: event.target.value })}
          className="flex h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink"
        >
          <option value="">Select a jurisdiction</option>
          {PROFESSIONAL_JURISDICTIONS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        {errors?.jurisdiction ? (
          <p className="text-[11px] text-[#b91c1c]">{errors.jurisdiction}</p>
        ) : (
          <p className="text-[11px] leading-relaxed text-ink/45">
            Optional. Registration details follow this choice. Ontario is not assumed.
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-designation`} className="text-sm font-medium text-ink">
          Professional designation
          <span className="text-danger"> *</span>
        </label>
        <Input
          id={`${idPrefix}-designation`}
          required={blockIncomplete}
          list={`${idPrefix}-designation-options`}
          value={value.designation}
          disabled={locked}
          onChange={(event) => patch({ designation: event.target.value })}
        />
        <datalist id={`${idPrefix}-designation-options`}>
          {designationOptions.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
        {errors?.designation ? (
          <p className="text-[11px] text-[#b91c1c]">{errors.designation}</p>
        ) : (
          <p className="text-[11px] leading-relaxed text-ink/45">
            Suggestions match the selected jurisdiction. A saved title is kept if you type your own.
          </p>
        )}
      </div>
      {licenseKind === "registration" ? (
        <Field
          id={`${idPrefix}-registration`}
          label={jurisdiction?.licenseLabel ?? PROFESSIONAL_FIELD_LABELS.registrationNumber}
          value={value.registrationNumber}
          onChange={(registrationNumber) => patch({ registrationNumber })}
          disabled={locked}
          className="sm:col-span-2"
          error={errors?.registrationNumber}
          hint="Optional."
        />
      ) : (
        <Field
          id={`${idPrefix}-reco`}
          label={
            licenseKind === "reco"
              ? PROFESSIONAL_FIELD_LABELS.recoLicenseNumber
              : "RECO / registration number"
          }
          value={value.recoLicenseNumber}
          onChange={(recoLicenseNumber) => patch({ recoLicenseNumber })}
          disabled={locked}
          error={errors?.recoLicenseNumber}
          hint="Optional."
        />
      )}
      <Field
        id={`${idPrefix}-reco-expiry`}
        label="Registration expiry date"
        type="date"
        value={value.recoLicenseExpiresAt}
        onChange={(recoLicenseExpiresAt) => patch({ recoLicenseExpiresAt })}
        disabled={locked}
        error={errors?.recoLicenseExpiresAt}
        hint="Optional."
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
  error,
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
  error?: string;
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
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        readOnly={disabled}
        autoComplete={autoComplete}
      />
      {error ? <p className="text-[11px] text-[#b91c1c]">{error}</p> : null}
      {hint && !error ? <p className="text-[11px] leading-relaxed text-ink/45">{hint}</p> : null}
    </div>
  );
}
