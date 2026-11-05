import Link from "next/link";
import { PlatformPageHeader } from "@/components/platform/PlatformUi";
import {
  HIGH_OCTANE_EMAIL_PREVIEW_GAPS,
  listHighOctaneEmailPreviews,
} from "@/lib/email/high-octane/preview-catalog";

type PageProps = {
  searchParams: Promise<{ template?: string }>;
};

export default async function HighOctaneEmailPreviewsPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;
  const previews = listHighOctaneEmailPreviews();
  const selected =
    previews.find((item) => item.id === params.template) ?? previews[0];

  return (
    <div>
      <PlatformPageHeader
        title="HIGH OCTANE email previews"
        description="Sample data only. Opening a preview does not send email, create a lead, or activate an account. Recipients use example.invalid."
      />
      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
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
                        href={`/platform/email-previews?template=${item.id}`}
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
  );
}
