import { prisma } from "@/lib/prisma";

export async function generateMetadata() {
  return { title: "Referral partners" };
}

const TYPE_LABEL: Record<string, string> = {
  MORTGAGE: "Mortgage",
  LAWYER: "Lawyer",
  INSPECTOR: "Home inspector",
  OTHER: "Partner",
};

export default async function PartnersPage() {
  const partners = await prisma.referralPartner.findMany({
    where: { active: true },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-12 sm:px-6">
      <div>
        <h1 className="font-display text-4xl text-ink">Referral partners</h1>
        <p className="mt-2 max-w-2xl text-ink/70">
          Mortgage, legal, and inspection partners Houzzat agents can introduce
          you to — tracked handoffs, no surprise spam.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {partners.map((p) => (
          <article
            key={p.id}
            className="rounded-2xl border border-line bg-surface p-5"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">
              {TYPE_LABEL[p.type] ?? p.type}
            </p>
            <h2 className="mt-2 font-display text-2xl text-ink">{p.name}</h2>
            {p.company ? (
              <p className="text-sm text-ink/60">{p.company}</p>
            ) : null}
            {p.city ? (
              <p className="mt-1 text-sm text-ink/50">{p.city}</p>
            ) : null}
            {p.bio ? (
              <p className="mt-3 text-sm text-ink/70">{p.bio}</p>
            ) : null}
          </article>
        ))}
      </div>

      {partners.length === 0 ? (
        <p className="text-sm text-ink/55">Partners coming soon.</p>
      ) : null}
    </div>
  );
}
