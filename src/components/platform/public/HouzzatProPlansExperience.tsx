import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { PlanComparison } from "@/components/platform/public/site/PlanComparison";
import { publicPlanCards, publicPlanRows, PUBLIC_PLAN_FAQS } from "@/lib/platform/public/platform-plan-presentation";

const SITE = "/images/home-preview/houzzatpro-consumer-desktop.png";
const CRM = "/images/home-preview/houzzatpro-crm-leads.png";
const PHONE = "/images/home-preview/houzzatpro-mobile-lead-profile.png?v=5";
const CHAT = "/images/home-preview/houzzatpro-lead-conversation.png";
const PROPERTIES = "/images/home-preview/houzzatpro-properties-desktop.png";

const JOURNEY = ["Website", "Leads", "CRM", "Properties", "Viewings", "Mobile"] as const;

function DemoLink({ light = false, children }: { light?: boolean; children: string }) {
  return (
    <Link
      href="/book-a-demo"
      className={light
        ? "hp-plan-cta inline-flex min-h-12 items-center gap-2 rounded-xl bg-emerald-300 px-5 text-sm font-bold text-[#042f27]"
        : "hp-plan-cta inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#07583f] px-5 text-sm font-bold text-white shadow-[0_12px_28px_rgba(7,88,63,0.16)]"}
    >
      {children}
      <span className="hp-plan-arrow" aria-hidden="true">→</span>
    </Link>
  );
}

function HeroStack() {
  return (
    <div className="relative mx-auto min-h-[460px] w-full max-w-[680px] lg:min-h-[560px] lg:max-w-none" data-hp-reveal="depth">
      <div className="absolute left-0 top-[8%] w-[78%] overflow-hidden rounded-[18px] border-[8px] border-[#111918] bg-[#111918] shadow-[0_28px_70px_rgba(12,40,31,0.18)]">
        <Image src={SITE} alt="HouzzatPRO consumer website" width={1440} height={900} unoptimized className="h-auto w-full" />
      </div>
      <div className="absolute right-0 top-[28%] z-20 w-[68%] overflow-hidden rounded-[18px] border border-white bg-white p-1.5 shadow-[0_28px_70px_rgba(16,40,32,0.2)]">
        <Image src={CRM} alt="HouzzatPRO CRM leads" width={1440} height={900} unoptimized className="h-auto w-full" />
      </div>
      <div className="absolute bottom-[2%] left-[8%] z-30 w-[26%] min-w-[108px] max-w-[150px] overflow-hidden rounded-[26px] border-[7px] border-[#101716] bg-[#101716] shadow-[0_22px_50px_rgba(10,34,27,0.28)]">
        <Image src={PHONE} alt="HouzzatPRO mobile lead profile" width={390} height={844} unoptimized className="h-auto w-full" />
      </div>
    </div>
  );
}

export function HouzzatProPlansExperience() {
  const cards = publicPlanCards();
  const rows = publicPlanRows();

  return (
    <>
      <section className="relative overflow-hidden bg-[#fbfcf9] lg:flex lg:min-h-[88vh] lg:items-center">
        <div className="pointer-events-none absolute -right-16 top-0 h-80 w-80 rounded-full bg-[#e7f1bf]/40 blur-3xl" />
        <div className="relative mx-auto grid w-full max-w-[1480px] items-center gap-12 px-4 py-16 sm:px-8 lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)] lg:px-10 lg:py-20 xl:px-12">
          <div className="max-w-[560px]">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-[#087052]" data-hp-reveal="fade">Choose your HouzzatPRO experience</p>
            <h1 className="mt-4 text-[clamp(2.4rem,4.8vw,4.4rem)] font-semibold leading-[0.98] tracking-[-0.048em] text-[#101817]" data-hp-reveal="heading">
              Built around your business. Ready for where you're going.
            </h1>
            <p className="mt-5 max-w-[520px] text-[17px] leading-7 text-[#53635e]" data-hp-reveal="body">
              Whether you're growing your personal brand, scaling a team, or building a brokerage-wide digital experience, there's a HouzzatPRO solution designed around the way you work.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <DemoLink>Book a Demo</DemoLink>
              <a href="#compare" className="inline-flex min-h-12 items-center rounded-xl border border-[#21483d]/15 bg-white/80 px-5 text-sm font-bold text-[#132b25]">
                Compare Plans
              </a>
            </div>
            <p className="mt-6 max-w-[460px] text-sm leading-6 text-[#5d726a]">
              No public price tags. No one-size-fits-all setup. We'll walk through your business and help you choose the right HouzzatPRO package.
            </p>
          </div>
          <HeroStack />
        </div>
      </section>

      <div className="border-y border-[#e5f0ea] bg-white">
        <div className="mx-auto flex max-w-[1480px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-4 text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#087052] sm:px-8 lg:px-10 xl:px-12">
          {JOURNEY.map((step, index) => (
            <span key={step} className="flex items-center gap-3">
              {index > 0 ? <span aria-hidden="true" className="text-[#9db5aa]">→</span> : null}
              {step}
            </span>
          ))}
        </div>
      </div>

      <section className="bg-[#f3faf6]">
        <div className="mx-auto w-full max-w-[1480px] px-4 py-16 sm:px-8 lg:px-10 lg:py-24 xl:px-12">
          <h2 className="max-w-[14ch] text-[clamp(2rem,3.6vw,3.5rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-[#101817]">Three ways to run the work.</h2>
          <div className="mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 lg:grid lg:grid-cols-3 lg:items-stretch lg:overflow-visible">
            {cards.map((card, index) => (
              <article
                key={card.code}
                data-hp-reveal="card"
                style={{ "--hp-delay": `${index * 90}ms` } as CSSProperties}
                className={`hp-plan-card w-[86%] shrink-0 snap-center rounded-[28px] border p-6 sm:w-[70%] lg:w-auto lg:shrink lg:p-8 ${card.featured ? "hp-plan-card-featured border-[#07583f] bg-[#07583f] text-white lg:-mt-4 lg:mb-[-8px]" : "border-[#d7e6dc] bg-white text-[#10201c]"}`}
              >
                <p className={`text-[11px] font-extrabold uppercase tracking-[0.18em] ${card.featured ? "text-emerald-200" : "text-[#087052]"}`}>{card.eyebrow}</p>
                <h3 className="mt-3 text-[2rem] font-semibold tracking-[-0.04em]">{card.name}</h3>
                <p className={`mt-3 text-sm leading-6 ${card.featured ? "text-white/80" : "text-[#5d726a]"}`}>{card.description}</p>
                <p className={`mt-8 text-lg font-semibold tracking-[-0.03em] ${card.featured ? "text-white" : "text-[#10201c]"}`}>{card.arrangement}</p>
                <div className="mt-6">
                  <DemoLink light={card.featured}>Book a Demo</DemoLink>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto w-full max-w-[1480px] px-4 py-16 sm:px-8 lg:px-10 lg:py-24 xl:px-12">
          <h2 className="max-w-[16ch] text-[clamp(2rem,3.4vw,3.3rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-[#101817]">Which HouzzatPRO is right for you?</h2>
          <div className="relative mt-10 grid gap-5 lg:grid-cols-3">
            <div className="pointer-events-none absolute left-[16%] right-[16%] top-8 hidden h-px bg-[#c9e2d6] lg:block" />
            {cards.map((card) => (
              <Link key={card.code} href={card.exploreHref} className="relative rounded-3xl bg-[#f6faf6] p-7 text-inherit no-underline">
                <h3 className="text-xl font-semibold tracking-[-0.03em] text-[#101817]">{card.name}</h3>
                <p className="mt-3 text-sm leading-6 text-[#5d726a]">{card.decision}</p>
                <p className="mt-6 text-sm font-bold text-[#07583f]">Explore →</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#fbfcf9]">
        <div className="mx-auto w-full max-w-[1480px] px-4 py-16 sm:px-8 lg:px-10 lg:py-24 xl:px-12">
          <h2 className="text-[clamp(2rem,3.4vw,3.3rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-[#101817]">Compare the HouzzatPRO experience.</h2>
          <p className="mt-4 max-w-[560px] text-[17px] leading-7 text-[#53635e]">See how each package can support your business. Marks follow the HouzzatPRO plan catalog.</p>
          <div className="mt-10">
            <PlanComparison cards={cards} rows={rows} />
          </div>
        </div>
      </section>

      <section className="overflow-hidden bg-white">
        <div className="mx-auto w-full max-w-[1480px] px-4 py-16 sm:px-8 lg:px-10 lg:py-24 xl:px-12">
          <h2 className="max-w-[16ch] text-[clamp(2rem,3.6vw,3.6rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-[#101817]">More than software. One connected real estate platform.</h2>
          <div className="mt-12 grid gap-8 lg:grid-cols-5">
            {[
              ["Generate", "Website and property search", SITE],
              ["Manage", "CRM and client activity", CRM],
              ["Engage", "Conversation on the lead record", CHAT],
              ["Show", "Property search in the workspace", PROPERTIES],
              ["Grow", "The agent app, included on every package", PHONE],
            ].map(([title, body, src]) => (
              <div key={title}>
                <div className="overflow-hidden rounded-2xl border border-[#e5efe9] bg-[#f7faf6] shadow-[0_16px_40px_rgba(16,40,32,0.06)]">
                  <Image src={src} alt="" width={800} height={520} unoptimized className="h-36 w-full object-cover object-left sm:h-44" />
                </div>
                <h3 className="mt-4 text-lg font-semibold tracking-[-0.03em] text-[#101817]">{title}</h3>
                <p className="mt-1 text-sm leading-6 text-[#5d726a]">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-[radial-gradient(circle_at_72%_36%,#08745e_0%,#045442_42%,#003328_100%)] text-white">
        <div className="mx-auto grid w-full max-w-[1480px] items-center gap-10 px-4 py-16 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:px-10 lg:py-24 xl:px-12">
          <div>
            <h2 className="max-w-[14ch] text-[clamp(2.2rem,4vw,3.8rem)] font-semibold leading-[0.98] tracking-[-0.045em]">Not sure which package fits your business?</h2>
            <p className="mt-5 max-w-[520px] text-[17px] leading-7 text-white/75">See HouzzatPRO in action and we'll help you find the right setup for the way you work.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <DemoLink light>Book Your Demo</DemoLink>
              <Link href="/product" className="inline-flex min-h-12 items-center rounded-xl border border-white/30 px-5 text-sm font-bold text-white">Explore the Platform</Link>
            </div>
          </div>
          <div className="relative min-h-[280px] sm:min-h-[360px]">
            <div className="absolute left-0 top-4 w-[78%] overflow-hidden rounded-2xl border border-white/20 bg-white p-1 shadow-2xl">
              <Image src={CRM} alt="HouzzatPRO CRM" width={1440} height={900} unoptimized className="h-auto w-full" />
            </div>
            <div className="absolute bottom-0 right-0 z-10 w-[28%] min-w-[108px] max-w-[150px] overflow-hidden rounded-[24px] border-[6px] border-[#101716] shadow-2xl">
              <Image src={PHONE} alt="HouzzatPRO mobile" width={390} height={844} unoptimized className="h-auto w-full" />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#fbfcf9]">
        <div className="mx-auto w-full max-w-[860px] px-4 py-16 sm:px-8 lg:py-24">
          <h2 className="text-[clamp(2rem,3.4vw,3.2rem)] font-semibold tracking-[-0.04em] text-[#101817]">Questions about the packages.</h2>
          <div className="mt-8 grid gap-3">
            {PUBLIC_PLAN_FAQS.map((item) => (
              <details key={item.q} className="rounded-2xl border border-[#d7e6dc] bg-white px-5">
                <summary className="cursor-pointer py-4 font-semibold text-[#10201c]">{item.q}</summary>
                <p className="pb-4 text-sm leading-6 text-[#5d726a]">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-6 px-4 py-16 sm:px-8 lg:flex-row lg:items-end lg:justify-between lg:px-10 lg:py-24 xl:px-12">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-[#087052]">Your next move</p>
            <h2 className="mt-4 max-w-[14ch] text-[clamp(2.2rem,4vw,3.8rem)] font-semibold leading-[0.98] tracking-[-0.045em] text-[#101817]">See what HouzzatPRO could look like for your business.</h2>
          </div>
          <DemoLink>Book a Demo</DemoLink>
        </div>
      </section>
    </>
  );
}
