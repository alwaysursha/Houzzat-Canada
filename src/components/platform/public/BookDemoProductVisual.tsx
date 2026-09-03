/**
 * Abstract HouzzatPRO product UI composition for Book a Demo.
 * Decorative only — not live data, not fake analytics.
 */

const PIPELINE = ["New Lead", "Qualified", "Viewing", "Offer"] as const;

export function BookDemoProductVisual() {
  return (
    <div
      aria-hidden
      className="book-demo-visual relative mt-8 select-none lg:mt-10"
    >
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-3.5">
        {/* Lead pipeline */}
        <div className="rounded-2xl border border-white/10 bg-[#0f172a]/80 p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:col-span-2 sm:p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-semibold tracking-[0.16em] text-emerald-300/90 uppercase">
              Lead Pipeline
            </p>
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,0.18)]" />
          </div>
          <div className="mt-3.5 flex flex-wrap gap-2">
            {PIPELINE.map((stage, index) => (
              <div
                key={stage}
                className={[
                  "flex min-w-0 flex-1 items-center gap-2 rounded-xl border px-2.5 py-2 text-[11px] font-medium sm:min-w-[5.5rem] sm:flex-none",
                  index === 1
                    ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-100"
                    : "border-white/10 bg-white/[0.04] text-slate-300",
                ].join(" ")}
              >
                <span
                  className={[
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    index === 1 ? "bg-emerald-400" : "bg-slate-500",
                  ].join(" ")}
                />
                <span className="truncate">{stage}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Team */}
        <div className="rounded-2xl border border-white/10 bg-[#0f172a]/80 p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:p-4">
          <p className="text-[10px] font-semibold tracking-[0.16em] text-slate-400 uppercase">
            Team
          </p>
          <ul className="mt-3 space-y-2">
            {[
              { label: "Agents", tone: "active" as const },
              { label: "Tasks", tone: "idle" as const },
              { label: "Appointments", tone: "idle" as const },
            ].map((row) => (
              <li
                key={row.label}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
              >
                <span className="text-[12px] font-medium text-slate-200">
                  {row.label}
                </span>
                <span
                  className={[
                    "h-1.5 w-1.5 rounded-full",
                    row.tone === "active" ? "bg-emerald-400" : "bg-slate-500",
                  ].join(" ")}
                />
              </li>
            ))}
          </ul>
        </div>

        {/* Property intelligence */}
        <div className="rounded-2xl border border-white/10 bg-[#0f172a]/80 p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:p-4">
          <p className="text-[10px] font-semibold tracking-[0.16em] text-slate-400 uppercase">
            Property Intelligence
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {["Listings", "Saved Homes", "CMA"].map((label) => (
              <div
                key={label}
                className="rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-transparent px-2 py-3 text-center"
              >
                <div className="mx-auto mb-2 h-1 w-6 rounded-full bg-emerald-400/50" />
                <p className="text-[10px] leading-tight font-medium text-slate-300">
                  {label}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Marketing */}
        <div className="rounded-2xl border border-white/10 bg-[#0f172a]/80 p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:col-span-2 sm:p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.16em] text-slate-400 uppercase">
                Marketing
              </p>
              <p className="mt-1 text-[12px] text-slate-400">
                Website · Lead Capture · Campaigns
              </p>
            </div>
            <div className="flex gap-1.5">
              {["Website", "Capture", "Campaigns"].map((chip, i) => (
                <span
                  key={chip}
                  className={[
                    "rounded-lg border px-2.5 py-1 text-[10px] font-semibold tracking-wide uppercase",
                    i === 0
                      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                      : "border-white/10 bg-white/[0.03] text-slate-400",
                  ].join(" ")}
                >
                  {chip}
                </span>
              ))}
            </div>
          </div>
          <div className="mt-3.5 h-16 overflow-hidden rounded-xl border border-white/10 bg-[#020617]/60">
            <div className="flex h-full">
              <div className="w-[28%] border-r border-white/10 bg-white/[0.03] p-2.5">
                <div className="h-1.5 w-10 rounded-full bg-slate-600" />
                <div className="mt-2 space-y-1.5">
                  <div className="h-1 w-8 rounded-full bg-slate-700" />
                  <div className="h-1 w-11 rounded-full bg-slate-700" />
                  <div className="h-1 w-7 rounded-full bg-emerald-500/40" />
                </div>
              </div>
              <div className="flex flex-1 flex-col justify-between p-2.5">
                <div className="flex gap-2">
                  <div className="h-8 flex-1 rounded-lg border border-white/10 bg-white/[0.04]" />
                  <div className="h-8 flex-1 rounded-lg border border-white/10 bg-white/[0.04]" />
                  <div className="h-8 w-16 rounded-lg border border-emerald-400/20 bg-emerald-400/10" />
                </div>
                <div className="h-1.5 w-2/3 rounded-full bg-slate-700" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
