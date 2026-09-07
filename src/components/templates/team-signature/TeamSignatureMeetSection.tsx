import type {
  TeamSignatureMemberPlaceholder,
  TeamSignatureView,
} from "@/lib/tenancy/templates/resolve-team-signature-view";
import { cn } from "@/lib/utils";

const INITIAL_VISIBLE = 8;

function MemberPhoto({
  member,
  className,
  large = false,
}: {
  member: TeamSignatureMemberPlaceholder;
  className?: string;
  large?: boolean;
}) {
  const initial = member.name.trim().charAt(0).toUpperCase() || "T";
  return (
    <div
      className={cn(
        "relative overflow-hidden bg-[var(--ts-ink,#0F6B4C)]",
        className,
      )}
    >
      {member.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={member.photoUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-top"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={cn(
              "font-display text-surface/25",
              large ? "text-7xl sm:text-8xl" : "text-4xl sm:text-5xl",
            )}
          >
            {initial}
          </span>
        </div>
      )}
    </div>
  );
}

function LeaderFeature({ member }: { member: TeamSignatureMemberPlaceholder }) {
  return (
    <article
      className="grid overflow-hidden border border-[var(--ts-ink,#0F6B4C)]/12 bg-[var(--ts-surface,#EEF3F0)] lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]"
      data-ts-member-card="leader"
    >
      <MemberPhoto
        member={member}
        large
        className="aspect-[4/5] sm:aspect-[5/4] lg:aspect-auto lg:min-h-[22rem]"
      />
      <div className="flex flex-col justify-center space-y-3 p-6 sm:p-8 lg:p-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ts-ink,#0F6B4C)]/45">
          Team Lead
        </p>
        <h3 className="font-display text-3xl tracking-tight text-[var(--ts-ink,#0F6B4C)] sm:text-4xl">
          {member.name}
        </h3>
        {member.designation ? (
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--ts-ink,#0F6B4C)]/50">
            {member.designation}
          </p>
        ) : null}
        {member.bio ? (
          <p className="max-w-xl text-base leading-relaxed text-[var(--ts-ink,#0F6B4C)]/65">
            {member.bio}
          </p>
        ) : null}
        <div className="space-y-1 pt-2 text-sm text-[var(--ts-ink,#0F6B4C)]/65">
          {member.cellPhone ? <p>Cell: {member.cellPhone}</p> : null}
          {member.email ? <p>Email: {member.email}</p> : null}
        </div>
      </div>
    </article>
  );
}

function SupportingCard({
  member,
}: {
  member: TeamSignatureMemberPlaceholder;
}) {
  return (
    <article
      className="border border-[var(--ts-ink,#0F6B4C)]/10 bg-[var(--ts-surface,#EEF3F0)]"
      data-ts-member-card="supporting"
    >
      <MemberPhoto member={member} className="aspect-[4/5]" />
      <div className="space-y-1.5 p-4">
        <h3 className="font-display text-lg tracking-tight text-[var(--ts-ink,#0F6B4C)] sm:text-xl">
          {member.name}
        </h3>
        {member.designation ? (
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ts-ink,#0F6B4C)]/45">
            {member.designation}
          </p>
        ) : null}
        <div className="space-y-0.5 pt-1 text-xs text-[var(--ts-ink,#0F6B4C)]/55">
          {member.cellPhone ? <p>Cell: {member.cellPhone}</p> : null}
          {member.email ? <p>Email: {member.email}</p> : null}
        </div>
      </div>
    </article>
  );
}

function supportingGridClass(count: number): string {
  if (count <= 1) return "grid gap-4 sm:grid-cols-1 max-w-sm";
  if (count === 2) return "grid gap-4 sm:grid-cols-2";
  if (count === 3) return "grid gap-4 sm:grid-cols-2 lg:grid-cols-3";
  return "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
}

/**
 * Stage 6.11E.2A / E.7 — Meet The Team: featured leader + supporting roster.
 * Scales for 1 / 2 / 4 / 8 / 15+ members. Live published roster or preview demo.
 */
export function TeamSignatureMeetSection({
  view,
}: {
  view: TeamSignatureView;
}) {
  const members = view.members;
  const leader =
    members?.find((m) => m.isLeader) ?? members?.[0] ?? null;
  const supporting =
    members && leader
      ? members.filter((m) => m.id !== leader.id)
      : [];
  const visibleSupporting = supporting.slice(0, INITIAL_VISIBLE - 1);
  const remaining = Math.max(0, supporting.length - visibleSupporting.length);

  return (
    <section
      id="meet-the-team"
      className="scroll-mt-32 bg-[var(--ts-ink,#0F6B4C)] px-4 py-14 text-surface sm:px-6 lg:px-10 lg:py-20"
      aria-labelledby="ts-meet-heading"
      data-ts-section="meet-the-team"
      data-ts-meet-layout="leader-supporting"
    >
      <div className="mx-auto max-w-7xl">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-surface/75">
            Meet the team
          </p>
          <h2
            id="ts-meet-heading"
            className="mt-2 font-display text-3xl tracking-tight sm:text-4xl"
          >
            The people behind {view.teamName}
          </h2>
          <p className="mt-3 text-base text-surface/85">
            {view.isDemoPreview
              ? "Sample roster for template preview only — not live team members."
              : "Public team profiles will appear here once your roster is published."}
          </p>
        </div>

        {members && members.length > 0 && leader ? (
          <div className="mt-10 space-y-8">
            <LeaderFeature member={leader} />
            {visibleSupporting.length > 0 ? (
              <div>
                <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-surface/70">
                  Team members
                </p>
                <div
                  className={supportingGridClass(visibleSupporting.length)}
                  data-ts-roster-count={String(visibleSupporting.length)}
                >
                  {visibleSupporting.map((member) => (
                    <SupportingCard key={member.id} member={member} />
                  ))}
                </div>
                {remaining > 0 ? (
                  <p className="mt-6 text-sm text-surface/80">
                    +{remaining} more team{" "}
                    {remaining === 1 ? "member" : "members"} — full roster
                    publishing coming soon.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <div
            className="mt-10 space-y-6"
            aria-hidden
            data-ts-meet-shell="empty"
          >
            <div className="grid overflow-hidden border border-dashed border-surface/25 lg:grid-cols-2">
              <div className="aspect-[4/5] bg-surface/10 lg:aspect-auto lg:min-h-[18rem]" />
              <div className="space-y-3 p-6 sm:p-8">
                <div className="h-3 w-24 bg-surface/15" />
                <div className="h-8 w-2/3 bg-surface/20" />
                <div className="h-3 w-1/2 bg-surface/12" />
                <div className="h-16 w-full bg-surface/10" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }, (_, i) => (
                <div
                  key={i}
                  className="border border-dashed border-surface/20"
                >
                  <div className="aspect-[4/5] bg-surface/10" />
                  <div className="space-y-2 p-4">
                    <div className="h-4 w-2/3 bg-surface/15" />
                    <div className="h-3 w-1/2 bg-surface/10" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
