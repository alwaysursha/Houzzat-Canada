"use client";

import Image from "next/image";
import Link from "next/link";
import { useId, useState, type CSSProperties } from "react";
import { ChartNoAxesColumn, ChevronDown, House, UserRound, UsersRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { HouzzatProWordmark } from "@/components/auth/HouzzatProWordmark";
import { PLATFORM_HOME_PRIMARY_CTA_HREF } from "@/lib/platform/public/platform-home-copy";

const DESKTOP_SHOT = "/images/home-preview/houzzatpro-launchpad-desktop.png";
const MOBILE_SHOT = "/images/home-preview/houzzatpro-mobile-lead-profile.png?v=5";

const checks = [
  "All-in-One Platform",
  "Built for Real Estate Professionals",
  "Easy to Get Started",
] as const;

function motionDelay(ms: number): CSSProperties {
  return { "--hp-delay": `${ms}ms` } as CSSProperties;
}

const callouts: { label: string; icon: LucideIcon; place: string }[] = [
  { label: "More Leads", icon: UserRound, place: "lg:left-[0%] lg:top-[16%]" },
  { label: "More Viewings", icon: House, place: "lg:left-[1%] lg:bottom-[22%]" },
  { label: "Higher Conversions", icon: ChartNoAxesColumn, place: "lg:right-[0%] lg:top-[11%]" },
  { label: "Growth Made Simple", icon: UsersRound, place: "lg:bottom-[25%] lg:right-[-28px]" },
];

const footerColumns: { title: string; links: { label: string; href?: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "#platform" },
      { label: "Mobile App", href: "#mobile-leads" },
      { label: "Consumer Website", href: "#consumer-website" },
      { label: "Integrations" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About Us" },
      { label: "Careers" },
      { label: "Contact" },
      { label: "Blog" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Help Centre", href: "/support" },
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
      { label: "Security" },
    ],
  },
];

export function HomePreviewFinalCta() {
  return (
    <>
      <section className="relative overflow-hidden bg-[radial-gradient(circle_at_72%_40%,#08745e_0%,#045442_38%,#003d31_72%,#003328_100%)] text-white">
        <div className="mx-auto grid max-w-[1500px] items-center gap-8 px-5 py-14 lg:grid-cols-[.86fr_1.14fr] lg:gap-10 lg:px-10 lg:py-24">
          <div className="relative z-20">
            <p className="text-xs font-bold tracking-[.25em] text-emerald-300" data-hp-reveal="fade">READY TO GROW?</p>
            <h2 className="mt-4 max-w-[700px] text-[clamp(32px,8.4vw,76px)] font-semibold leading-[.98] tracking-[-.04em] lg:mt-6 lg:text-[clamp(46px,4.7vw,76px)] lg:tracking-[-.055em]" data-hp-reveal="heading" style={motionDelay(90)}>
              Turn more leads into clients with <span className="tracking-normal text-emerald-300">HouzzatPRO.</span>
            </h2>
            <p className="mt-4 max-w-[650px] text-base leading-7 text-white/70 lg:mt-7 lg:text-lg lg:leading-8" data-hp-reveal="body" style={motionDelay(180)}>
              Everything you need to capture, manage and convert real estate leads — in one connected platform.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 lg:mt-9 lg:gap-4" data-hp-reveal style={motionDelay(280)}>
              <Link
                href={PLATFORM_HOME_PRIMARY_CTA_HREF}
                data-hp-cta
                className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-emerald-300 px-5 py-3 text-sm font-semibold text-[#042f27] shadow-xl lg:px-8 lg:py-4 lg:text-base"
              >
                Book a Demo <span className="hp-cta-arrow" aria-hidden="true">→</span>
              </Link>
              <Link
                href="/pricing"
                data-hp-cta
                className="inline-flex min-h-12 items-center rounded-xl border border-white/35 px-5 py-3 text-sm font-semibold text-white lg:px-8 lg:py-4 lg:text-base"
              >
                Explore Plans
              </Link>
            </div>
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 lg:mt-9 lg:gap-x-8" >
              {checks.map((label, index) => (
                <div key={label} className="flex items-center gap-2 text-sm font-medium text-white/90" data-hp-reveal="fade" style={motionDelay(380 + index * 80)}>
                  <span className="grid h-5 w-5 place-items-center rounded-full border border-emerald-300 text-[11px] text-emerald-300">
                    ✓
                  </span>
                  {label}
                </div>
              ))}
            </div>
          </div>

          <div className="relative mx-auto grid w-full max-w-[680px] grid-cols-2 gap-3 lg:mx-0 lg:block lg:min-h-[500px] lg:max-w-none">
            <div className="pointer-events-none absolute inset-[10%] hidden rounded-[50%] border border-dashed border-emerald-300/50 lg:block" data-hp-reveal="fade" style={motionDelay(160)} />
            <div className="relative z-10 col-span-2 w-full lg:absolute lg:left-[22%] lg:top-[18%] lg:w-[48%]" data-hp-reveal="depth" style={motionDelay(220)}>
              <div className="rotate-[4deg] overflow-hidden rounded-[24px] border-[8px] border-[#111a18] bg-white shadow-2xl lg:rotate-[4deg]">
              <Image
                src={DESKTOP_SHOT}
                alt="HouzzatPRO desktop launchpad"
                width={1536}
                height={1024}
                unoptimized
                priority
                className="h-auto w-full"
              />
              </div>
            </div>
            <div className="relative z-20 col-span-2 -mt-8 mx-auto w-[min(200px,54%)] lg:absolute lg:bottom-[8%] lg:right-[28%] lg:mx-0 lg:mt-0 lg:w-[20%]" data-hp-reveal="depth" style={motionDelay(420)}>
              <div className="rotate-[5deg] overflow-hidden rounded-[34px] border-[8px] border-[#121a18] bg-white shadow-2xl">
              <Image
                src={MOBILE_SHOT}
                alt="HouzzatPRO mobile lead profile for Emily Carter"
                width={1170}
                height={2517}
                unoptimized
                priority
                className="h-auto w-full"
              />
              </div>
            </div>
            {callouts.map(({ label, icon: Icon, place }, index) => (
              <div
                key={label}
                data-hp-reveal="card"
                style={motionDelay(520 + index * 90)}
                className={`relative z-30 flex items-center gap-2 rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-3 py-2.5 text-sm font-semibold text-white shadow-lg backdrop-blur lg:absolute ${place}`}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-300/15 text-emerald-200">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                {label}
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="bg-white" data-hp-reveal="fade" style={motionDelay(40)}>
        <div className="mx-auto max-w-[1500px] px-6 py-8 lg:px-10 lg:py-12">
          <div className="lg:grid lg:grid-cols-[1.7fr_1fr_1fr_1fr_1fr] lg:gap-10">
            <div>
              <Link href="/" aria-label="HouzzatPRO home">
                <HouzzatProWordmark size="md" className="text-[1.7rem] text-[#10201c]" />
              </Link>
              <p className="mt-4 max-w-[360px] text-sm leading-6 text-neutral-500">
                The all-in-one real estate lead generation platform built for modern agents and brokerages.
              </p>
            </div>
            <FooterAccordions columns={footerColumns} />
            {footerColumns.map((column) => (
              <div key={column.title} className="hidden lg:block">
                <FooterCol title={column.title} links={column.links} />
              </div>
            ))}
            <div className="hidden lg:block">
              <h3 className="font-semibold text-[#10201c]">Follow Us</h3>
            </div>
          </div>
          <div className="mt-8 flex flex-col gap-3 border-t border-neutral-200 pt-6 text-sm text-neutral-500 lg:mt-10 lg:flex-row lg:items-center lg:justify-between">
            <p>© 2026 HouzzatPRO. All rights reserved.</p>
            <p>
              Built for Real Estate Professionals <span className="mx-2">|</span> Powered by Houzzat
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}

function FooterAccordions({
  columns,
}: {
  columns: { title: string; links: { label: string; href?: string }[] }[];
}) {
  const baseId = useId();
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="mt-6 border-t border-neutral-200 lg:hidden">
      {columns.map((column) => {
        const expanded = open === column.title;
        const panelId = `${baseId}-${column.title.replace(/\s+/g, "-")}`;
        return (
          <div key={column.title} className="border-b border-neutral-200">
            <button
              type="button"
              className="flex min-h-12 w-full items-center justify-between text-left text-sm font-semibold text-[#10201c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              aria-expanded={expanded}
              aria-controls={panelId}
              onClick={() => setOpen((current) => (current === column.title ? null : column.title))}
            >
              {column.title}
              <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
            <div id={panelId} className={`grid transition-[grid-template-rows] duration-200 ease-out ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
              <div className="overflow-hidden">
                <div className="space-y-1 pb-3">
                  {column.links.map((link) =>
                    link.href ? (
                      <Link key={link.label} href={link.href} className="hp-link block min-h-11 py-2 text-sm text-neutral-500">
                        {link.label}
                      </Link>
                    ) : (
                      <p key={link.label} className="py-2 text-sm text-neutral-500">
                        {link.label}
                      </p>
                    ),
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
      <p className="py-4 text-sm font-semibold text-[#10201c]">Follow Us</p>
    </div>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { label: string; href?: string }[];
}) {
  return (
    <div>
      <h3 className="font-semibold text-[#10201c]">{title}</h3>
      <div className="mt-3 space-y-1.5">
        {links.map((link) =>
          link.href ? (
            <Link key={link.label} href={link.href} className="hp-link block py-2.5 text-sm text-neutral-500 hover:text-emerald-700 lg:py-1">
              {link.label}
            </Link>
          ) : (
            <p key={link.label} className="text-sm text-neutral-500">
              {link.label}
            </p>
          ),
        )}
      </div>
    </div>
  );
}
