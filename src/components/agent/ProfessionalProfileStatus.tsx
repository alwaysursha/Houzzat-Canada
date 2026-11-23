export function ProfessionalProfileStatus({
  complete,
  missingLabels,
}: {
  complete: boolean;
  missingLabels: string[];
}) {
  if (complete) {
    return (
      <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
        Professional profile complete. A photograph and licensing details are optional.
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <p className="font-semibold">Complete your professional profile</p>
      <p className="mt-1">
        Still needed: {missingLabels.join(", ")}.
      </p>
      <p className="mt-1 text-xs">
        A photograph and licensing details are optional. This profile is marked onboarded when every required field is saved.
      </p>
    </div>
  );
}
