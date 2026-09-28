import Link from "next/link";
import type { ReactNode } from "react";

type Tone = "paper" | "mint" | "white" | "ink";

const toneClass: Record<Tone, string> = {
  paper: "bg-[#fbfcf9]",
  mint: "bg-[#f3faf6]",
  white: "bg-white",
  ink: "bg-[radial-gradient(circle_at_72%_36%,#08745e_0%,#045442_42%,#003328_100%)] text-white",
};

export function Section({
  tone,
  children,
  tall = false,
}: {
  tone: Tone;
  children: ReactNode;
  tall?: boolean;
}) {
  return (
    <section className={`relative overflow-hidden ${toneClass[tone]} ${tall ? "lg:flex lg:min-h-[88vh] lg:items-center" : ""}`}>
      {tone === "mint" ? <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-[#bcebd1]/45 blur-3xl" /> : null}
      {tone === "paper" ? <div className="pointer-events-none absolute -right-16 top-0 h-80 w-80 rounded-full bg-[#e7f1bf]/35 blur-3xl" /> : null}
      <div className="relative w-full">{children}</div>
    </section>
  );
}

export function Shell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`mx-auto w-full max-w-[1480px] px-4 sm:px-8 lg:px-10 xl:px-12 ${className}`}>
      {children}
    </div>
  );
}

export function Kicker({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return (
    <p className={`text-[11px] font-extrabold uppercase tracking-[0.22em] ${light ? "text-emerald-200" : "text-[#087052]"}`} data-hp-reveal="fade">
      {children}
    </p>
  );
}

export function Display({
  as,
  children,
}: {
  as: "h1" | "h2";
  children: ReactNode;
}) {
  const className = "mt-4 text-[clamp(2.15rem,4.6vw,4.15rem)] font-semibold leading-[0.98] tracking-[-0.048em] text-[#101817]";
  if (as === "h1") {
    return <h1 className={className} data-hp-reveal="heading">{children}</h1>;
  }
  return <h2 className={className} data-hp-reveal="heading">{children}</h2>;
}

export function Lead({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return (
    <p className={`mt-5 max-w-[540px] text-[17px] leading-7 ${light ? "text-white/75" : "text-[#53635e]"}`} data-hp-reveal="body">
      {children}
    </p>
  );
}

export function Actions({ pricing = true }: { pricing?: boolean }) {
  return (
    <div className="mt-8 flex flex-wrap gap-3" data-hp-reveal="fade">
      <Link href="/book-a-demo" className="inline-flex min-h-12 items-center rounded-xl bg-[#07583f] px-5 text-sm font-bold text-white shadow-[0_12px_28px_rgba(7,88,63,0.16)]">
        Book a Demo
      </Link>
      {pricing ? (
        <Link href="/pricing" className="inline-flex min-h-12 items-center rounded-xl border border-[#21483d]/15 bg-white/80 px-5 text-sm font-bold text-[#132b25]">
          Pricing
        </Link>
      ) : null}
    </div>
  );
}

export function Split({
  tone,
  reverse = false,
  copy,
  visual,
}: {
  tone: Tone;
  reverse?: boolean;
  copy: ReactNode;
  visual: ReactNode;
}) {
  return (
    <Section tone={tone}>
      <Shell className="grid items-center gap-12 py-16 lg:grid-cols-2 lg:gap-20 lg:py-24">
        <div className={reverse ? "lg:order-2" : ""}>{copy}</div>
        <div className={reverse ? "lg:order-1" : ""} data-hp-reveal="depth">{visual}</div>
      </Shell>
    </Section>
  );
}

export function Workflow({
  eyebrow,
  title,
  steps,
}: {
  eyebrow: string;
  title: string;
  steps: readonly { title: string; body: string }[];
}) {
  const width = steps.length >= 5 ? "hp-pub-flow-5" : steps.length === 3 ? "hp-pub-flow-3" : "hp-pub-flow-4";
  return (
    <Section tone="white">
      <Shell className="py-16 lg:py-24">
        <Kicker>{eyebrow}</Kicker>
        <h2 className="mt-4 max-w-[16ch] text-[clamp(2rem,3.4vw,3.4rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-[#101817]" data-hp-reveal="heading">
          {title}
        </h2>
        <ol className={`hp-pub-flow ${width}`}>
          {steps.map((step, index) => (
            <li key={step.title} data-hp-reveal="card">
              <span className="hp-pub-index">{String(index + 1).padStart(2, "0")}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
      </Shell>
    </Section>
  );
}

export function CapabilityGrid({
  title,
  points,
}: {
  title: string;
  points: readonly { title: string; body: string }[];
}) {
  return (
    <Section tone="mint">
      <Shell className="py-16 lg:py-24">
        <h2 className="max-w-[16ch] text-[clamp(2rem,3.2vw,3.2rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-[#101817]" data-hp-reveal="heading">
          {title}
        </h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {points.map((point) => (
            <article key={point.title} className="rounded-3xl border border-[#d7e6dc] bg-white p-6 shadow-[0_18px_40px_rgba(16,40,32,0.05)]" data-hp-reveal="card">
              <h3 className="text-[16px] font-extrabold text-[#14201d]">{point.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[#66736f]">{point.body}</p>
            </article>
          ))}
        </div>
      </Shell>
    </Section>
  );
}

export function PathList({ links }: { links: readonly { href: string; title: string; body: string }[] }) {
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {links.map((link) => (
        <Link key={`${link.href}-${link.title}`} href={link.href} className="flex min-h-[168px] flex-col justify-between rounded-3xl bg-[#f6faf6] p-7 text-inherit no-underline" data-hp-reveal="card">
          <div>
            <h3 className="text-[20px] font-semibold tracking-[-0.03em] text-[#101817]">{link.title}</h3>
            <p className="mt-3 text-sm leading-6 text-[#5d726a]">{link.body}</p>
          </div>
          <p className="mt-6 text-sm font-bold text-[#07583f]">Open</p>
        </Link>
      ))}
    </div>
  );
}

export function Closing({ title }: { title: string }) {
  return (
    <Section tone="ink">
      <Shell className="grid items-end gap-8 py-16 lg:grid-cols-[1.4fr_auto] lg:py-24">
        <div>
          <Kicker light>Book a demo</Kicker>
          <h2 className="mt-4 max-w-[16ch] text-[clamp(2.2rem,4vw,3.8rem)] font-semibold leading-[0.98] tracking-[-0.045em] text-white" data-hp-reveal="heading">
            {title}
          </h2>
        </div>
        <Link href="/book-a-demo" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-emerald-300 px-6 text-sm font-bold text-[#042f27] shadow-xl" data-hp-reveal="fade">
          Book a Demo
        </Link>
      </Shell>
    </Section>
  );
}

export function Footnote({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <div className="bg-white">
      <Shell className="pb-4 pt-2 lg:pb-8">
        <p className="max-w-[760px] text-sm leading-6 text-[#5d726a]">{text}</p>
      </Shell>
    </div>
  );
}

export function Hero({
  kicker,
  headline,
  lead,
  visual,
  tall = true,
  actions = true,
}: {
  kicker: string;
  headline: string;
  lead: string;
  visual: ReactNode;
  tall?: boolean;
  actions?: boolean;
}) {
  return (
    <Section tone="paper" tall={tall}>
      <Shell className={visual ? "grid items-center gap-12 py-16 lg:grid-cols-[minmax(0,0.84fr)_minmax(0,1.16fr)] lg:gap-16 lg:py-20" : "py-20 lg:py-28"}>
        <div className="max-w-[560px]">
          <Kicker>{kicker}</Kicker>
          <Display as="h1">{headline}</Display>
          <Lead>{lead}</Lead>
          {actions ? <Actions /> : null}
        </div>
        {visual ? <div data-hp-reveal="depth">{visual}</div> : null}
      </Shell>
    </Section>
  );
}
