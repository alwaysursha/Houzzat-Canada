import Link from "next/link";
import {
  HIGH_OCTANE_EMAIL_PREVIEW_GAPS,
  listHighOctaneEmailPreviews,
} from "@/lib/email/high-octane/preview-catalog";

export function HighOctaneEmailPreviewGallery({
  basePath,
  templateId,
}: {
  basePath: string;
  templateId?: string | null;
}) {
  const previews = listHighOctaneEmailPreviews();
  const selected = previews.find((item) => item.id === templateId) ?? previews[0];

  return (
    <div className="min-h-dvh bg-[#0f172a] text-slate-100">
      <div className="mx-auto max-w-[1600px] px-5 py-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#C8A66A]">
          HIGH OCTANE
        </p>
        <h1 className="mt-2 font-display text-2xl font-semibold text-white">
          Email previews
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Sample data only. These previews do not send email, create a lead, or
          activate an account. Recipients use example.invalid.
        </p>
        <div className="mt-8 grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <nav className="space-y-4">
            {(["transactional", "operational"] as const).map((group) => (
              <div key={group}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  {group}
                </p>
                <ul className="space-y-1">
                  {previews
                    .filter((item) => item.group === group)
                    .map((item) => (
                      <li key={item.id}>
                        <Link
                          href={`${basePath}?template=${item.id}`}
                          className={`block rounded px-3 py-2 text-sm ${
                            item.id === selected?.id
                              ? "bg-white text-slate-900"
                              : "text-slate-300 hover:bg-slate-800"
                          }`}
                        >
                          {item.label}
                        </Link>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Not sent today
              </p>
              <ul className="space-y-2 text-xs leading-5 text-slate-400">
                {HIGH_OCTANE_EMAIL_PREVIEW_GAPS.map((gap) => (
                  <li key={gap}>{gap}</li>
                ))}
              </ul>
            </div>
          </nav>
          {selected ? (
            <section>
              <p className="text-sm text-slate-300">
                <span className="text-slate-500">Subject · </span>
                {selected.subject}
              </p>
              <p className="mt-2 text-sm text-slate-400">
                {selected.personalSignature
                  ? "Sample assigned agent: Jordan Sample. The workspace owner is not used."
                  : "A personal agent signature is not used on this email."}
              </p>
              <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,680px)_390px]">
                <figure>
                  <figcaption className="mb-2 text-xs uppercase tracking-[0.14em] text-slate-400">
                    Desktop
                  </figcaption>
                  <iframe
                    title={`${selected.label} desktop preview`}
                    sandbox=""
                    srcDoc={selected.html}
                    className="h-[820px] w-full max-w-[680px] border border-slate-700 bg-white"
                  />
                </figure>
                <figure>
                  <figcaption className="mb-2 text-xs uppercase tracking-[0.14em] text-slate-400">
                    Mobile
                  </figcaption>
                  <iframe
                    title={`${selected.label} mobile preview`}
                    sandbox=""
                    srcDoc={selected.html}
                    className="h-[820px] w-[390px] max-w-full border border-slate-700 bg-white"
                  />
                </figure>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
