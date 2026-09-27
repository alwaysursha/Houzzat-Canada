import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import {
  Bell,
  Calendar,
  CircleDollarSign,
  Eye,
  House,
  Mail,
  MapPin,
  MessageSquare,
  Search,
  Smartphone,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import "./home-preview.css";
import { HomePreviewEverything } from "@/components/platform/public/HomePreviewEverything";
import { HomePreviewFinalCta } from "@/components/platform/public/HomePreviewFinalCta";
import { HomePreviewLeadOrbit } from "@/components/platform/public/HomePreviewLeadOrbit";
import { HomePreviewNav } from "@/components/platform/public/HomePreviewNav";
import { HouzzatProWordmark } from "@/components/auth/HouzzatProWordmark";
import {
  PLATFORM_HOME_PRIMARY_CTA_HREF,
  PLATFORM_HOME_SECONDARY_CTA_HREF,
} from "@/lib/platform/public/platform-home-copy";

/**
 * Approved HouzzatPRO homepage. Rendered on the platform apex `/`.
 * Metadata stays on the marketing layout: indexable, no preview robots.
 *
 * Required existing assets:
 * /public/images/home-preview/houzzatpro-launchpad-desktop.png
 * /public/images/home-preview/houzzatpro-launchpad-mobile.png
 *
 * Optional hero background:
 * /public/images/home-preview/hero-luxury-home.jpg
 *
 * Rendered as the HouzzatPRO apex homepage (/).
 * Metadata stays on the marketing layout: indexable, no preview robots.
 */

const NAV = [
  { label: "Platform", href: "#platform" },
  { label: "Features", href: "#platform" },
  { label: "Solutions", href: "#platform" },
  { label: "Pricing", href: "/pricing" },
  { label: "Resources", href: "/support" },
] as const;

const DESKTOP_SHOT =
  "/images/home-preview/houzzatpro-launchpad-desktop.png";
const MOBILE_SHOT =
  "/images/home-preview/houzzatpro-launchpad-mobile.png";
const HERO_HOME =
  "/images/home-preview/hero-luxury-home.jpg";

function motionDelay(ms: number): CSSProperties {
  return { "--hp-delay": `${ms}ms` } as CSSProperties;
}

function ArrowRight({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`hp-cta-arrow ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h14M14 7l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <span className="grid h-8 w-8 place-items-center rounded-full border border-[#173b31]">
      <svg className="ml-0.5 h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M6.5 4.6v10.8L15 10 6.5 4.6Z" />
      </svg>
    </span>
  );
}

function LeadsIcon() {
  return (
    <svg viewBox="0 0 28 28" className="h-6 w-6 lg:h-7 lg:w-7" fill="none" aria-hidden="true">
      <circle cx="10" cy="9" r="4" fill="currentColor" />
      <circle cx="20" cy="10" r="3" fill="currentColor" opacity=".65" />
      <path d="M3.5 23c.4-5 3.1-7.5 6.5-7.5s6.1 2.5 6.5 7.5H3.5Zm12.8 0c.1-3-1-5.2-3-6.5 1.3-1.2 3-1.8 4.8-1.8 3.2 0 5.6 2.4 5.9 7.1V23h-7.7Z" fill="currentColor" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 28 28" className="h-6 w-6 lg:h-7 lg:w-7" fill="none" aria-hidden="true">
      <circle cx="14" cy="14" r="10" stroke="currentColor" strokeWidth="2.2" />
      <path d="M14 8v6l4 2" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BarsIcon() {
  return (
    <svg viewBox="0 0 28 28" className="h-6 w-6 lg:h-7 lg:w-7" fill="none" aria-hidden="true">
      <path d="M5 23V15h4v8H5Zm7 0V7h4v16h-4Zm7 0V11h4v12h-4Z" fill="currentColor" />
    </svg>
  );
}

const VALUES = [
  { title: "More Qualified Leads", icon: <LeadsIcon /> },
  { title: "Save Hours Every Week", icon: <ClockIcon /> },
  { title: "Higher Conversions", icon: <BarsIcon /> },
  { title: "Built for Agents & Teams", icon: <LeadsIcon /> },
] as const;

const FLOW = [
  { n: "1", title: "Lead Captured", sub: "from your website", icon: "person" },
  { n: "2", title: "Routed to Agent", sub: "instantly", icon: "funnel" },
  { n: "3", title: "Start a Conversation", sub: "chat, call or text", icon: "chat" },
  { n: "4", title: "Show Properties", sub: "& plan viewings", icon: "house" },
  { n: "5", title: "Nurture & Convert", sub: "to a lifelong client", icon: "handshake" },
] as const;

type FlowIconName = (typeof FLOW)[number]["icon"];

function FlowGlyph({ name }: { name: FlowIconName }) {
  const shared = {
    viewBox: "0 0 24 24",
    className: "h-7 w-7",
    "aria-hidden": true as const,
  };

  switch (name) {
    case "person":
      return (
        <svg {...shared} fill="currentColor">
          <circle cx="12" cy="7.4" r="3.15" />
          <path d="M5.6 19.4c.9-3.5 3.1-5.2 6.4-5.2s5.5 1.7 6.4 5.2H5.6Z" />
        </svg>
      );
    case "funnel":
      return (
        <svg {...shared} fill="currentColor">
          <path d="M3.8 5.1h16.4c.4 0 .6.4.4.7l-5.8 7.4a1 1 0 0 0-.2.6v3.8c0 .5-.5.8-.9.6l-2.8-1.3a.8.8 0 0 1-.5-.7v-2.4a1 1 0 0 0-.2-.6L3.4 5.8c-.2-.3 0-.7.4-.7Z" />
        </svg>
      );
    case "chat":
      return (
        <svg
          {...shared}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5.5 6.4h13a2 2 0 0 1 2 2v5.8a2 2 0 0 1-2 2H11l-3.4 2.3v-2.3H5.5a2 2 0 0 1-2-2V8.4a2 2 0 0 1 2-2Z" />
          <path d="M8 10.2h8M8 13h5.2" />
        </svg>
      );
    case "house":
      return (
        <svg {...shared} fill="currentColor">
          <path d="M12 4.1 3.6 11h1.8v8.1c0 .4.4.8.8.8h3.8v-4.4h4v4.4h3.8c.4 0 .8-.4.8-.8V11h1.8L12 4.1Z" />
        </svg>
      );
    case "handshake":
      return (
        <svg
          viewBox="0 0 24 24"
          className="h-8 w-8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m11 17 2 2a1 1 0 1 0 3-3" />
          <path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4" />
          <path d="m21 3 1 11h-2" />
          <path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3" />
          <path d="M3 4h8" />
        </svg>
      );
    default: {
      const uncovered: never = name;
      return uncovered;
    }
  }
}

type MobileLeadCard = {
  id: string;
  icon: LucideIcon;
  label: string;
  title: string;
  body?: string;
};

const MOBILE_LEAD_CARDS: MobileLeadCard[] = [
  {
    id: "new-lead",
    icon: UserRound,
    label: "NEW LEAD",
    title: "Emily Carter",
    body: "Just registered on your website",
  },
  {
    id: "property-interest",
    icon: Eye,
    label: "PROPERTY INTEREST",
    title: "Viewed 5 properties",
    body: "2 hours ago",
  },
  {
    id: "viewing-requested",
    icon: Calendar,
    label: "VIEWING REQUESTED",
    title: "Tomorrow at 11:00 AM",
  },
  {
    id: "listing-alert",
    icon: Bell,
    label: "NEW LISTING ALERT",
    title: "12 new properties match",
    body: "your client's criteria",
  },
  {
    id: "follow-up",
    icon: MessageSquare,
    label: "FOLLOW-UP SENT",
    title: "Automated SMS",
    body: "sent successfully",
  },
  {
    id: "price-change",
    icon: CircleDollarSign,
    label: "PRICE CHANGE",
    title: "3 new matches",
    body: "for your clients",
  },
];

function MobileLeadActivityCard({ card, compact = false }: { card: MobileLeadCard; compact?: boolean }) {
  const Icon = card.icon;
  return (
    <div className={compact
      ? "rounded-xl border border-[#d7ebe3] bg-white/95 px-2.5 py-2 shadow-[0_10px_24px_rgba(16,40,32,.08)]"
      : "rounded-2xl border border-[#d7ebe3] bg-white/95 px-4 py-3.5 shadow-[0_16px_40px_rgba(16,40,32,.1)]"}>
      <p className={compact
        ? "flex items-center gap-1.5 text-[9px] font-semibold tracking-[.06em] text-emerald-700"
        : "flex items-center gap-2 text-[11px] font-semibold tracking-[.08em] text-emerald-700"}>
        <Icon className={compact ? "h-3 w-3 shrink-0" : "h-3.5 w-3.5 shrink-0"} aria-hidden="true" />
        {card.label}
      </p>
      <p className={compact ? "mt-1 text-[13px] font-semibold leading-4 text-[#10201c]" : "mt-1.5 text-[15px] font-semibold leading-5 text-[#10201c]"}>{card.title}</p>
      {card.body ? <p className={compact ? "mt-0.5 text-[11px] leading-4 text-neutral-500" : "mt-0.5 text-sm leading-5 text-neutral-500"}>{card.body}</p> : null}
    </div>
  );
}

function LeadProfilePhone({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact
      ? "overflow-hidden rounded-[28px] border-[7px] border-[#121a18] bg-white pb-6 shadow-[0_22px_50px_rgba(16,40,32,.16)]"
      : "overflow-hidden rounded-[38px] border-[11px] border-[#121a18] bg-white pb-9 shadow-[0_28px_70px_rgba(16,40,32,.18)]"}>
      <Image
        src="/images/home-preview/houzzatpro-mobile-lead-profile.png?v=5"
        alt="HouzzatPRO mobile lead profile for Emily Carter"
        width={1170}
        height={2517}
        unoptimized
        className="h-auto w-full"
      />
    </div>
  );
}

export function HomePreviewPage() {
  return (
    <main className="min-h-dvh overflow-x-hidden bg-[#fbfcf9] text-[#0d1715]">
      {/* HERO */}
      <section className="relative isolate overflow-hidden border-b border-[#dfe8e1] bg-[#f7faf6]">
        {/* Concept 1 atmospheric layers */}
        <div className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(circle_at_24%_72%,rgba(151,221,185,.26),transparent_28%),linear-gradient(110deg,#f9fbf7_0%,#f5faf5_45%,#edf6ef_100%)]" />
        <div
          className="hp-parallax hp-parallax-hero pointer-events-none absolute right-0 top-0 -z-10 hidden h-full w-[56%] bg-cover bg-center opacity-[0.92] lg:block"
          style={{ backgroundImage: `url("${HERO_HOME}")` }}
        />
        <div className="pointer-events-none absolute inset-0 -z-10 hidden bg-[linear-gradient(90deg,#f7faf6_0%,#f7faf6_38%,rgba(247,250,246,.82)_52%,rgba(247,250,246,.14)_78%,rgba(247,250,246,.02)_100%)] lg:block" />

        {/* HEADER */}
        <header className="relative z-40">
          <div className="relative mx-auto flex max-w-[1480px] items-center justify-between gap-2.5 px-4 py-3 sm:gap-5 sm:px-8 lg:px-10 lg:py-5 xl:px-12">
            <Link href="/" aria-label="HouzzatPRO home" className="shrink-0" data-hp-enter="fade" style={motionDelay(40)}>
              <HouzzatProWordmark size="md" className="text-[1.2rem] min-[380px]:text-[1.45rem] sm:text-[1.7rem]" />
            </Link>
            <HomePreviewNav
              links={NAV}
              loginHref={PLATFORM_HOME_SECONDARY_CTA_HREF}
              demoHref={PLATFORM_HOME_PRIMARY_CTA_HREF}
            />
          </div>
        </header>

        <div className="mx-auto grid max-w-[1480px] grid-cols-1 items-center gap-5 px-5 pb-6 pt-3 sm:px-8 lg:min-h-[560px] lg:grid-cols-[0.82fr_1.18fr] lg:gap-3 lg:px-10 lg:pb-12 lg:pt-7 xl:px-12">
          {/* COPY */}
          <div className="relative z-20 max-w-[760px] lg:pb-3">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#0a5a42] sm:text-xs sm:tracking-[0.22em] lg:mb-4" data-hp-enter style={motionDelay(220)}>
              Real Estate Lead Generation &amp; CRM Platform
            </p>

            <h1 className="text-[clamp(1.7rem,4.3vw,3.55rem)] font-bold leading-[1.05] tracking-[-0.02em] text-[#0b1417]">
              <span className="block min-[1280px]:whitespace-nowrap" data-hp-enter="heading" style={motionDelay(300)}>Grow Your</span>
              <span className="block min-[1280px]:whitespace-nowrap" data-hp-enter="heading" style={motionDelay(380)}>Real Estate Business</span>
              <span className="block min-[1280px]:whitespace-nowrap" data-hp-enter="heading" style={motionDelay(460)}>
                with <span className="tracking-normal text-[#087052]">HouzzatPRO</span>
              </span>
            </h1>

            <p className="mt-4 max-w-[555px] text-[15px] leading-6 text-[#273d37] sm:mt-6 sm:text-[17px] sm:leading-7" data-hp-enter="body" style={motionDelay(560)}>
              Generate more qualified leads, manage your clients, show properties and close more deals — all in one powerful platform designed for real estate professionals.
            </p>

            <div className="mt-5 flex flex-col gap-2.5 sm:flex-row lg:mt-6 lg:gap-3" data-hp-enter style={motionDelay(680)}>
              <a
                href={PLATFORM_HOME_PRIMARY_CTA_HREF}
                data-hp-cta
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#07583f] px-6 text-sm font-bold text-white shadow-[0_12px_28px_rgba(7,88,63,.18)]"
              >
                Book a Demo
                <ArrowRight />
              </a>
              <a
                href="#platform"
                data-hp-cta
                className="inline-flex min-h-12 items-center justify-center gap-3 rounded-xl border border-[#21483d] bg-white/50 px-6 text-sm font-semibold text-[#132b25] backdrop-blur-sm hover:bg-white"
              >
                <PlayIcon />
                See How It Works
              </a>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 lg:mt-8 lg:max-w-[610px] lg:gap-x-6 lg:gap-y-5">
              {VALUES.map((item, index) => (
                <div key={item.title} className="flex min-w-0 flex-col gap-1.5 text-[#07583f] lg:gap-2" data-hp-enter="fade" style={motionDelay(820 + index * 80)}>
                  {item.icon}
                  <span className="max-w-[118px] text-[11px] font-medium leading-[1.25] text-[#263c36] sm:text-xs">
                    {item.title}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* PRODUCT COMPOSITION */}
          <div className="relative z-10 mx-auto w-full max-w-[850px] lg:-mr-6 lg:min-h-[540px] xl:-mr-10">
            {/* soft floor glow */}
            <div className="pointer-events-none absolute bottom-[3%] left-[6%] right-[1%] h-[24%] rounded-[50%] bg-[#9bd9b8]/30 blur-3xl" />

            {/* Laptop — shiny grey metal screen, no keyboard base */}
            <div
              className="relative ml-auto mt-2 w-[94%] sm:w-[91%] lg:absolute lg:right-0 lg:top-[2%] lg:w-[90%]"
              style={{ perspective: "1400px", ...motionDelay(560) }}
              data-hp-enter="depth"
            >
              <div className="hp-laptop">
                <div
                  style={{
                    background:
                      "linear-gradient(128deg, #d5dbe1 0%, #8d969e 14%, #5c656d 38%, #a3abb3 52%, #4a525a 78%, #717980 100%)",
                    borderRadius: 18,
                    padding: "12px 12px 10px",
                    boxShadow:
                      "0 28px 50px rgba(16, 28, 24, 0.32), inset 0 1px 0 rgba(255,255,255,0.55)",
                  }}
                >
                  <div
                    className="relative"
                    style={{
                      background: "#141618",
                      borderRadius: 10,
                      padding: "11px 8px 8px",
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        position: "absolute",
                        top: 4,
                        left: "50%",
                        width: 7,
                        height: 7,
                        transform: "translateX(-50%)",
                        borderRadius: 999,
                        background:
                          "radial-gradient(circle at 35% 35%, #6d7580, #1a1c1e 70%)",
                      }}
                    />
                    <div className="relative aspect-[3/2] overflow-hidden rounded-[7px] bg-white">
                      <Image
                        src={DESKTOP_SHOT}
                        alt="HouzzatPRO desktop Launchpad"
                        fill
                        priority
                        unoptimized
                        sizes="(max-width: 1024px) 90vw, 52vw"
                        className="object-contain object-top"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Phone — shiny grey metal frame, front-left, over the laptop */}
            <div className="relative z-20 -mt-[40%] ml-4 w-[42%] max-w-[188px] sm:-mt-[28%] sm:w-[28%] sm:max-w-none sm:min-w-[158px] lg:absolute lg:bottom-[1%] lg:left-0 lg:ml-0 lg:mt-0 lg:w-[30%]" data-hp-enter="depth" style={motionDelay(820)}>
              <div className="hp-phone">
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: -2,
                    top: "18%",
                    width: 3,
                    height: 14,
                    borderRadius: 2,
                    background: "linear-gradient(180deg, #c5ccd3, #5c656d)",
                  }}
                />
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: -2,
                    top: "26%",
                    width: 3,
                    height: 28,
                    borderRadius: 2,
                    background: "linear-gradient(180deg, #c5ccd3, #5c656d)",
                  }}
                />
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: -2,
                    top: "36%",
                    width: 3,
                    height: 28,
                    borderRadius: 2,
                    background: "linear-gradient(180deg, #c5ccd3, #5c656d)",
                  }}
                />
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    right: -2,
                    top: "24%",
                    width: 3,
                    height: 42,
                    borderRadius: 2,
                    background: "linear-gradient(180deg, #c5ccd3, #5c656d)",
                  }}
                />
                <div
                  style={{
                    background:
                      "linear-gradient(155deg, #e3e7eb 0%, #8e979f 10%, #4e565e 32%, #b4bcc4 48%, #5a626a 68%, #3a4249 100%)",
                    borderRadius: 36,
                    padding: 6,
                    boxShadow:
                      "0 26px 46px rgba(8, 22, 18, 0.38), inset 0 1px 0 rgba(255,255,255,0.45)",
                  }}
                >
                  <div
                    style={{
                      background: "#121416",
                      borderRadius: 30,
                      padding: 3,
                    }}
                  >
                    <div className="relative aspect-[9/19.5] overflow-hidden rounded-[26px] bg-white">
                      <Image
                        src={MOBILE_SHOT}
                        alt="HouzzatPRO mobile Launchpad"
                        fill
                        priority
                        unoptimized
                        sizes="(max-width: 1024px) 30vw, 16vw"
                        className="object-cover object-top"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* BROKERAGE POSITIONING STRIP */}
      <section className="border-b border-[#e4e9e5] bg-white">
        <div className="mx-auto flex max-w-[1480px] flex-col items-center gap-3 px-5 py-3.5 sm:px-8 lg:flex-row lg:gap-5 lg:px-10 lg:py-5 xl:px-12">
          <div className="shrink-0 text-center lg:w-[220px] lg:text-left" data-hp-reveal="fade" style={motionDelay(40)}>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#60716b]">
              Built for agents across
              <br />
              leading brokerages
            </p>
          </div>

          {/* Intentionally textual until approved logo assets are provided.
              Do not imply endorsement/partnership. */}
          <div className="grid w-full grid-cols-3 items-center gap-x-3 gap-y-2 text-center text-[13px] font-extrabold tracking-[-0.02em] text-[#5b615f] sm:gap-x-6 sm:text-[15px] lg:grid-cols-6 lg:text-[17px]">
            <span data-hp-reveal="fade" style={motionDelay(120)}>RE/MAX</span>
            <span data-hp-reveal="fade" style={motionDelay(180)}>Royal LePage</span>
            <span data-hp-reveal="fade" style={motionDelay(240)}>CENTURY 21</span>
            <span data-hp-reveal="fade" style={motionDelay(300)}>Sutton</span>
            <span data-hp-reveal="fade" style={motionDelay(360)}>EXIT</span>
            <span data-hp-reveal="fade" style={motionDelay(420)}>HomeLife</span>
          </div>
        </div>
      </section>

      {/* LEAD LIFECYCLE */}
      <section id="platform" className="relative overflow-hidden bg-[#fff]">
        <div className="pointer-events-none absolute -left-24 top-16 h-52 w-52 rounded-full bg-[#c9efd8]/30 blur-3xl" />
        <div className="pointer-events-none absolute -right-24 bottom-0 h-52 w-52 rounded-full bg-[#e7f5d8]/45 blur-3xl" />

        <div className="mx-auto max-w-[1380px] px-5 py-9 sm:px-8 lg:px-10 lg:py-14">
          <div className="mx-auto max-w-[1100px] text-center">
            <h2 className="text-[34px] font-black leading-tight tracking-[-0.035em] text-[#101817] sm:text-[42px]" data-hp-reveal="heading">
              From Lead to Lifetime Client
            </h2>
            <p className="mx-auto mt-2 max-w-[40rem] text-balance text-sm leading-6 text-[#5b6965] sm:text-[15px] xl:max-w-none xl:whitespace-nowrap" data-hp-reveal="body" style={motionDelay(90)}>
              A complete real estate growth platform that turns website visitors into conversations, viewings and closed deals.
            </p>
          </div>

          <div className="relative mt-6 lg:mt-9">
            <svg className="pointer-events-none absolute left-[23px] top-4 z-0 h-[calc(100%-2rem)] w-0.5 lg:hidden" viewBox="0 0 2 100" preserveAspectRatio="none" aria-hidden="true">
              <path className="hp-draw" data-hp-draw pathLength={1} d="M1 0 V100" fill="none" stroke="#9dcfb8" strokeWidth="2" vectorEffect="non-scaling-stroke" style={motionDelay(180)} />
            </svg>
          <div className="relative z-10 grid grid-cols-1 gap-3 lg:grid-cols-5 lg:gap-2">
            {FLOW.map((step, index) => (
              <div key={step.title} className="relative flex items-center gap-3 lg:flex-col lg:gap-3 lg:text-center" data-hp-reveal="card" data-hp-step style={motionDelay(160 + index * 110)}>
                <div className={`hp-step-icon relative z-10 grid h-12 w-12 shrink-0 place-items-center rounded-full lg:h-16 lg:w-16 ${
                  index === 1
                    ? "bg-[#07583f] text-white shadow-[0_12px_26px_rgba(7,88,63,.22)]"
                    : index === 4
                      ? "bg-[#ffe5ad] text-[#69470a]"
                      : "bg-[#c9efd8] text-[#07583f]"
                }`}>
                  <FlowGlyph name={step.icon} />
                </div>

                <div>
                  <p className="text-[13px] font-extrabold text-[#101817]">
                    {step.n}. {step.title}
                  </p>
                  <p className="mt-0.5 text-xs text-[#65716d]">{step.sub}</p>
                </div>

                {index < FLOW.length - 1 ? (
                  <div className="absolute -right-[7px] top-[23px] hidden text-[#82908b] lg:block" data-hp-reveal="fade" style={motionDelay(240 + index * 110)}>
                    <ArrowRight className="h-5 w-5" />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          </div>
        </div>
      </section>

      {/* CRM STORY — place directly AFTER the existing Lead Lifecycle section */}
      <section id="crm" className="relative overflow-hidden bg-[#f6faf6]">
        <div className="pointer-events-none absolute -left-28 top-28 h-80 w-80 rounded-full bg-[#bcebd1]/30 blur-3xl" />
        <div className="pointer-events-none absolute -right-24 bottom-20 h-72 w-72 rounded-full bg-[#e7f1bf]/35 blur-3xl" />

        <div className="mx-auto max-w-[1480px] px-5 py-12 sm:px-8 lg:px-10 lg:py-24 xl:px-12">
          <div className="grid items-center gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16">
            <div className="max-w-[520px]">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-[#087052]" data-hp-reveal="fade">
                One CRM. The Complete Client Journey.
              </p>
              <h2 className="mt-4 text-[38px] font-black leading-[1.02] tracking-[-0.045em] text-[#101817] sm:text-[48px] lg:text-[56px]" data-hp-reveal="heading" style={motionDelay(80)}>
                Turn every lead into a <span className="text-[#087052]">real relationship.</span>
              </h2>
              <p className="mt-6 text-[16px] leading-7 text-[#53635e]" data-hp-reveal="body" style={motionDelay(160)}>
                Keep every lead, conversation, property interaction and follow-up in one place.
                HouzzatPRO gives your team the context to respond faster and keep opportunities moving.
              </p>

              <div className="mt-8 space-y-5">
                {[
                  ["01", "Organize every opportunity", "See pipeline stage, timing, activity and ownership at a glance."],
                  ["02", "Know your client", "Bring saved searches, preferences, reminders and engagement into one profile."],
                  ["03", "Keep the conversation moving", "Chat, share properties and follow up without losing the client story."],
                ].map(([n, title, body], index) => (
                  <div key={n} className="flex gap-4" data-hp-reveal="card" style={motionDelay(240 + index * 90)}>
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#d7f2e2] text-[11px] font-black text-[#087052]">{n}</div>
                    <div>
                      <h3 className="text-[15px] font-extrabold text-[#14201d]">{title}</h3>
                      <p className="mt-1 text-sm leading-6 text-[#66736f]">{body}</p>
                    </div>
                  </div>
                ))}
              </div>

              <a href={PLATFORM_HOME_PRIMARY_CTA_HREF}
                data-hp-cta
                className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#07583f] px-5 py-3 text-sm font-bold text-white shadow-[0_12px_28px_rgba(7,88,63,.16)] lg:mt-9 lg:px-6">
                See HouzzatPRO in Action <ArrowRight />
              </a>
            </div>

            <div className="relative min-h-[480px] sm:min-h-[540px] lg:min-h-[620px]" style={{ perspective: "1200px" }} data-hp-tilt>
              <div className="absolute left-[1%] top-[4%] w-[83%] overflow-hidden rounded-[18px] border border-white/80 bg-white p-1.5 shadow-[0_28px_70px_rgba(19,48,39,.16)]" data-hp-reveal="depth" style={motionDelay(80)}>
                <Image src="/images/home-preview/houzzatpro-crm-leads.png" alt="HouzzatPRO CRM lead management"
                  width={1650} height={928} unoptimized sizes="(max-width: 1024px) 90vw, 48vw" className="h-auto w-full rounded-[13px]" />
              </div>

              <div className="absolute right-0 top-[28%] z-20 w-[78%] overflow-hidden rounded-[18px] border border-white/90 bg-white p-1.5 shadow-[0_30px_75px_rgba(18,49,39,.22)]" data-hp-reveal="depth" style={motionDelay(240)}>
                <Image src="/images/home-preview/houzzatpro-lead-activity.png" alt="HouzzatPRO lead profile and activity timeline"
                  width={1650} height={928} unoptimized sizes="(max-width: 1024px) 86vw, 45vw" className="h-auto w-full rounded-[13px]" />
              </div>

              <div className="absolute bottom-[1%] left-[5%] z-30 w-[60%] overflow-hidden rounded-[16px] border border-white bg-white p-1 shadow-[0_25px_60px_rgba(16,42,34,.24)]" data-hp-reveal="depth" style={motionDelay(420)}>
                <Image src="/images/home-preview/houzzatpro-lead-conversation.png" alt="HouzzatPRO client conversation and property sharing"
                  width={1650} height={928} unoptimized sizes="(max-width: 1024px) 72vw, 35vw" className="h-auto w-full rounded-[12px]" />
              </div>

              <div className="absolute bottom-[5%] right-[3%] z-40 rounded-2xl border border-[#dcebe3] bg-white/95 px-4 py-3 shadow-xl backdrop-blur" data-hp-reveal="card" style={motionDelay(560)}>
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#72817c]">Client Journey</p>
                <p className="mt-1 text-sm font-extrabold text-[#07583f]">Lead → Profile → Conversation</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PROPERTIES & VIEWINGS — insert directly after the CRM Story section */}
      <section id="properties-viewings" className="relative overflow-hidden bg-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_72%_58%,rgba(164,225,194,.23),transparent_31%),linear-gradient(180deg,#ffffff_0%,#fbfefb_58%,#f3faf5_100%)]" />

        <div className="relative mx-auto grid max-w-[1480px] items-center gap-8 px-5 py-12 sm:px-8 lg:grid-cols-[0.72fr_1.28fr] lg:gap-12 lg:px-10 lg:py-24 xl:px-12">
          <div className="relative z-20 max-w-[520px]">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-[#087052]" data-hp-reveal="fade">
              Properties &amp; Viewings
            </p>

            <h2 className="mt-4 text-[40px] font-black leading-[1.02] tracking-[-0.045em] text-[#101817] sm:text-[50px] lg:text-[58px]" data-hp-reveal="heading" style={motionDelay(80)}>
              From search to showing, all in <span className="text-[#087052]">one workflow.</span>
            </h2>

            <p className="mt-6 max-w-[500px] text-[16px] leading-7 text-[#66736f]" data-hp-reveal="body" style={motionDelay(150)}>
              Explore live MLS® listings, find the right matches for your clients, then take your viewing schedule with you in the HouzzatPRO mobile app.
            </p>

            <div className="mt-6 space-y-4 lg:mt-9 lg:space-y-6">
              {[
                ["⌂", "Search Live Listings", "Explore for sale and for rent properties on an interactive map with live MLS® data."],
                ["⌖", "Add to Your Viewing Plan", "Shortlist properties and organize an efficient viewing day for your clients."],
                ["▣", "Take It on the Go", "Use the HouzzatPRO mobile app to follow your optimized viewing schedule anywhere."],
              ].map(([icon, title, body], index) => (
                <div key={title} className="flex gap-4" data-hp-reveal="card" style={motionDelay(220 + index * 90)}>
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#d9f4e5] text-xl font-black text-[#087052] lg:h-14 lg:w-14 lg:text-2xl">
                    {icon}
                  </div>
                  <div className="pt-1">
                    <h3 className="text-[16px] font-extrabold text-[#14201d]">{title}</h3>
                    <p className="mt-1 max-w-[390px] text-sm leading-6 text-[#687670]">{body}</p>
                  </div>
                </div>
              ))}
            </div>

            <a
              href={PLATFORM_HOME_PRIMARY_CTA_HREF}
              data-hp-cta
              className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#07583f] px-5 py-3 text-sm font-bold text-white shadow-[0_12px_28px_rgba(7,88,63,.16)] lg:mt-9 lg:px-6"
            >
              See Properties &amp; Viewing Planner
              <ArrowRight />
            </a>
          </div>

          <div className="relative z-10 flex flex-col lg:block lg:min-h-[700px]" data-hp-watch>
            <div className="relative z-20 order-1 w-full overflow-hidden rounded-[22px] border-[8px] border-[#111918] bg-[#111918] shadow-[0_32px_75px_rgba(12,40,31,.24)] lg:absolute lg:left-[1%] lg:top-[1%] lg:order-0 lg:w-[88%]" data-hp-reveal="depth" style={motionDelay(120)}>
              <Image
                src="/images/home-preview/houzzatpro-properties-desktop.png"
                alt="HouzzatPRO desktop Properties search and map"
                width={1650}
                height={928}
                unoptimized
                sizes="(max-width: 1024px) 92vw, 50vw"
                className="h-auto w-full rounded-[13px]"
              />
            </div>

            {/* Mobile Viewing Planner — deliberately shown as mobile-only capability */}
            <div className="relative z-30 order-3 mx-auto -mt-16 w-[min(220px,60%)] overflow-hidden rounded-[32px] border-[7px] border-[#101716] bg-[#101716] shadow-[0_30px_65px_rgba(10,34,27,.30)] lg:absolute lg:right-0 lg:top-[24%] lg:order-0 lg:mx-0 lg:mt-0 lg:w-[26%] lg:min-w-[170px]" data-hp-reveal="depth" style={motionDelay(380)}>
              <div className="relative bg-white @container">
                <Image
                  src="/images/home-preview/houzzatpro-viewing-planner-mobile.png"
                  alt="HouzzatPRO Mobile Viewing Planner"
                  width={768}
                  height={1488}
                  unoptimized
                  sizes="(max-width: 1024px) 31vw, 15vw"
                  className="h-auto w-full"
                />
                {/* Marketing-only stat correction overlay; sits on the screenshot summary bar, below the date. */}
                <div
                  className="absolute left-[4%] right-[4%] top-[11.5%] flex h-[5.8%] items-center justify-center whitespace-nowrap rounded-lg bg-[#d9eee5] px-1 text-center font-extrabold leading-none tracking-tight text-[#07583f]"
                  style={{ fontSize: "clamp(6px, 3.15cqw, 11px)" }}
                >
                  5 viewings · 20.0 km · 1 hr 10 min driving
                </div>
              </div>
            </div>

            <div
              className="pointer-events-none relative z-10 order-2 -mt-2 w-full max-w-full lg:absolute lg:bottom-[-2%] lg:left-[-7%] lg:order-0 lg:mt-0 lg:w-[110%] lg:max-w-none"
              data-hp-wipe
              style={motionDelay(460)}
            >
              <div className="hp-parallax">
            <Image
              src="/images/home-preview/houzzatpro-neighbourhood-route-background.png?v=3"
              alt=""
              width={1024}
              height={409}
              unoptimized
              className="pointer-events-none h-auto w-full max-w-full object-contain opacity-[0.82] lg:max-w-none"
              style={{
                maskImage:
                  "linear-gradient(to right, transparent 0%, #000 11%, #000 89%, transparent 100%), linear-gradient(to bottom, #000 0%, #000 70%, transparent 100%)",
                WebkitMaskImage:
                  "linear-gradient(to right, transparent 0%, #000 11%, #000 89%, transparent 100%), linear-gradient(to bottom, #000 0%, #000 70%, transparent 100%)",
                maskComposite: "intersect",
                WebkitMaskComposite: "source-in",
              }}
            />
              </div>
            </div>

            <div className="relative z-40 order-4 mx-auto -mt-4 flex w-fit max-w-full items-center divide-x divide-[#dce9e1] rounded-2xl border border-white bg-white/95 px-3 py-2.5 shadow-[0_20px_50px_rgba(20,53,43,.18)] backdrop-blur sm:px-6 sm:py-4 lg:absolute lg:bottom-[14%] lg:left-[46%] lg:order-0 lg:mx-0 lg:mt-0" data-hp-reveal="card" style={motionDelay(820)}>
              <div className="pr-4 sm:pr-6">
                <p className="text-[18px] font-black tracking-[-.03em] text-[#101817] sm:text-[22px]">1 hr 10 min</p>
                <p className="text-[11px] text-[#7a8782]">Total driving time</p>
              </div>
              <div className="pl-4 sm:pl-6">
                <p className="text-[18px] font-black tracking-[-.03em] text-[#101817] sm:text-[22px]">20.0 km</p>
                <p className="text-[11px] text-[#7a8782]">Total distance</p>
              </div>
            </div>

            <div className="relative z-40 order-5 mx-auto mt-2 w-fit max-w-full rounded-full border border-[#cce5d7] bg-white/95 px-4 py-2 text-center text-[10px] font-bold uppercase tracking-[0.13em] text-[#087052] shadow-lg lg:absolute lg:bottom-[5%] lg:right-[2%] lg:order-0 lg:mx-0 lg:mt-0" data-hp-reveal="fade" style={motionDelay(960)}>
              HouzzatPRO Mobile · Viewing Planner
            </div>
          </div>
        </div>
      </section>

      <section id="consumer-website" className="relative overflow-hidden bg-white py-12 lg:py-32">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_48%,rgba(211,244,231,.55),transparent_34%)]" />
        <div className="relative mx-auto grid max-w-[1480px] items-center gap-8 px-5 lg:grid-cols-[0.78fr_1.22fr] lg:gap-14 lg:px-10">
          <div className="max-w-[590px]">
            <p className="mb-4 text-xs font-bold tracking-[.22em] text-emerald-700 lg:mb-6" data-hp-reveal="fade">YOUR WEBSITE. YOUR BRAND. YOUR LEADS.</p>
            <h2 className="text-[clamp(32px,8vw,70px)] font-semibold leading-[.98] tracking-[-.04em] text-[#0c1715] lg:text-[clamp(42px,4.2vw,70px)] lg:tracking-[-.055em]" data-hp-reveal="heading" style={motionDelay(80)}>
              Turn your website into a lead-generating <span className="text-emerald-700">machine.</span>
            </h2>
            <p className="mt-5 max-w-[560px] text-base leading-7 text-neutral-500 lg:mt-8 lg:text-lg lg:leading-8" data-hp-reveal="body" style={motionDelay(150)}>
              Give clients a modern real estate experience built around your brand — from property search and listing discovery to registrations, saved homes and direct agent connections.
            </p>
            <div className="mt-6 space-y-4 lg:mt-10 lg:space-y-7">
              {(
                [
                  [House, "Your Brand, Front and Centre", "A professional real estate website customized for your business."],
                  [Search, "Powerful Property Search", "Let buyers explore live MLS® listings through a modern search experience."],
                  [Users, "Convert Visitors into Leads", "Turn property searches, registrations and client activity into opportunities inside HouzzatPRO."],
                ] as const
              ).map(([Icon, title, copy], index) => (
                <div key={title} className="flex gap-3 lg:gap-5" data-hp-reveal="card" style={motionDelay(220 + index * 90)}>
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-700 lg:h-14 lg:w-14">
                    <Icon className="h-5 w-5 lg:h-6 lg:w-6" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-[#10201c] lg:text-lg">{title}</h3>
                    <p className="mt-1 text-base leading-6 text-neutral-500">{copy}</p>
                  </div>
                </div>
              ))}
            </div>
            <a href="#" data-hp-cta className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-xl bg-emerald-800 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-950/10 lg:mt-10 lg:gap-5 lg:px-7 lg:py-4">
              See Consumer Website Features <span className="hp-cta-arrow" aria-hidden="true">→</span>
            </a>
          </div>

          <div className="relative flex flex-col lg:block lg:min-h-[760px]">
            <div className="absolute inset-x-[5%] top-[8%] h-[76%] rounded-[48%] bg-emerald-50/70 blur-2xl" />
            <svg
              className="pointer-events-none absolute inset-0 z-[5] hidden h-full w-full lg:block"
              viewBox="0 0 795 760"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <marker
                  id="hp-cw-arrow"
                  viewBox="0 0 12 12"
                  refX="10.2"
                  refY="6"
                  markerWidth="11"
                  markerHeight="11"
                  orient="auto"
                  markerUnits="userSpaceOnUse"
                >
                  <path
                    d="M2.2 2.1 L10 6 L2.2 9.9"
                    fill="none"
                    stroke="#087052"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </marker>
              </defs>
              <path
                className="hp-draw"
                data-hp-draw
                pathLength={1}
                d="M430 104 C368 34 304 22 250 60"
                fill="none"
                stroke="#087052"
                strokeWidth="2.5"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                markerEnd="url(#hp-cw-arrow)"
                style={motionDelay(640)}
              />
              <path
                className="hp-draw"
                data-hp-draw
                pathLength={1}
                d="M248 582 C318 512 392 548 384 628"
                fill="none"
                stroke="#087052"
                strokeWidth="2.5"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                markerEnd="url(#hp-cw-arrow)"
                style={motionDelay(800)}
              />
              <path
                className="hp-draw"
                data-hp-draw
                pathLength={1}
                d="M618 458 C702 528 672 548 652 598"
                fill="none"
                stroke="#087052"
                strokeWidth="2.5"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                markerEnd="url(#hp-cw-arrow)"
                style={motionDelay(960)}
              />
            </svg>
            <div className="relative z-10 w-full overflow-hidden rounded-[26px] border-[9px] border-[#111c1a] bg-white shadow-2xl lg:absolute lg:right-0 lg:top-[11%] lg:w-[88%]" data-hp-reveal="depth" style={motionDelay(80)}>
              <Image src="/images/home-preview/houzzatpro-consumer-desktop.png" alt="HouzzatPRO consumer property search on desktop" width={1600} height={929} unoptimized className="h-auto w-full" />
              <div className="absolute left-[1.3%] top-[1.15%] bg-[#eef5f1] px-2 py-1 text-[clamp(9px,.8vw,14px)] font-semibold text-[#14201d]">Houzzat<span className="text-emerald-700">PRO</span></div>
            </div>

            <div className="relative z-20 -mt-14 ml-3 w-[min(168px,46%)] overflow-hidden rounded-[34px] border-[8px] border-[#151b1a] bg-white shadow-2xl lg:absolute lg:bottom-[2%] lg:left-[2%] lg:ml-0 lg:mt-0 lg:w-[31%]" data-hp-reveal="depth" style={motionDelay(280)}>
              <Image src="/images/home-preview/houzzatpro-consumer-mobile.png" alt="HouzzatPRO consumer property search on mobile" width={754} height={1600} unoptimized className="h-auto w-full" />
              <div className="absolute left-[3%] top-[1.5%] bg-[#eef5f1] px-2 py-1 text-[clamp(8px,.7vw,13px)] font-semibold text-[#14201d]">Houzzat<span className="text-emerald-700">PRO</span></div>
            </div>

            <div className="relative z-30 -mt-6 grid grid-cols-6 gap-2 lg:contents">
              <svg className="pointer-events-none absolute -left-1 top-0 h-full w-14 lg:hidden" viewBox="0 0 40 180" preserveAspectRatio="none" aria-hidden="true">
                <path className="hp-mobile-flow" data-hp-draw pathLength={1} d="M10 0 C 10 48, 30 62, 30 100 C 30 142, 12 156, 14 180" fill="none" stroke="#087052" strokeWidth="1.6" strokeLinecap="round" vectorEffect="non-scaling-stroke" style={motionDelay(420)} />
              </svg>
            <div className="relative z-30 col-span-4 rounded-2xl border border-black/5 bg-white/95 px-3 py-2.5 shadow-xl backdrop-blur lg:absolute lg:left-0 lg:top-[2%] lg:px-5 lg:py-4" data-hp-reveal="card" style={motionDelay(480)}>
              <p className="text-xs font-semibold text-emerald-700">NEW LEAD</p><p className="mt-1 font-semibold text-[#10201c]">Emily Carter</p><p className="text-sm text-neutral-500">Just registered on your website</p>
            </div>
            <div className="relative z-30 col-span-4 col-start-3 rounded-2xl border border-black/5 bg-white/95 px-3 py-2.5 shadow-xl backdrop-blur lg:absolute lg:bottom-[3%] lg:left-[38%] lg:px-5 lg:py-4" data-hp-reveal="card" style={motionDelay(620)}>
              <p className="text-xs font-semibold text-emerald-700">PROPERTY SAVED</p><p className="mt-1 font-semibold text-[#10201c]">332 Palmer Avenue</p><p className="text-sm text-neutral-500">Saved to favourites</p>
            </div>
            <div className="relative z-30 col-span-5 rounded-2xl border border-black/5 bg-white/95 px-3 py-2.5 shadow-xl backdrop-blur lg:absolute lg:bottom-[7%] lg:right-0 lg:px-5 lg:py-4" data-hp-reveal="card" style={motionDelay(760)}>
              <p className="text-xs font-semibold text-emerald-700">VIEWING REQUESTED</p><p className="mt-1 font-semibold text-[#10201c]">New client activity</p><p className="text-sm text-neutral-500">Requested a viewing for this property</p>
            </div>
            </div>
          </div>
        </div>
      </section>

      <section id="mobile-leads" className="relative overflow-hidden bg-white py-12 lg:py-32">
        <div className="relative mx-auto grid max-w-[1480px] items-center gap-8 px-5 lg:grid-cols-[1.14fr_0.86fr] lg:gap-12 lg:px-10">
          <div>
            <div id="hp-lead-orbit-stage" className="relative mx-auto hidden min-h-[920px] max-w-[820px] min-[1400px]:block" data-hp-watch>
              <div className="pointer-events-none absolute left-1/2 top-1/2 h-[92%] w-[78%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] bg-emerald-100/40 blur-3xl" />
              <div className="pointer-events-none absolute left-1/2 top-1/2 h-[64%] w-[46%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-50/90 blur-3xl" />
              <HomePreviewLeadOrbit />
              <div className="absolute left-1/2 top-1/2 z-10 w-[348px] -translate-x-1/2 -translate-y-1/2" data-hp-reveal="fade" style={motionDelay(160)}>
                <div className="hp-lead-phone">
                  <LeadProfilePhone />
                </div>
              </div>
              <div data-orbit="new-lead" className="absolute left-[calc(50%-414px)] top-[16%] z-20 w-[214px]">
                <div data-hp-reveal="card" style={motionDelay(280)}><MobileLeadActivityCard card={MOBILE_LEAD_CARDS[0]} /></div>
              </div>
              <div data-orbit="property-interest" className="absolute left-[calc(50%-408px)] top-[40%] z-20 w-[214px]">
                <div data-hp-reveal="card" style={motionDelay(420)}><MobileLeadActivityCard card={MOBILE_LEAD_CARDS[1]} /></div>
              </div>
              <div data-orbit="viewing-requested" className="absolute left-[calc(50%-396px)] top-[64%] z-20 w-[214px]">
                <div data-hp-reveal="card" style={motionDelay(560)}><MobileLeadActivityCard card={MOBILE_LEAD_CARDS[2]} /></div>
              </div>
              <div data-orbit="listing-alert" className="absolute right-[calc(50%-396px)] top-[10%] z-20 w-[220px]">
                <div data-hp-reveal="card" style={motionDelay(700)}><MobileLeadActivityCard card={MOBILE_LEAD_CARDS[3]} /></div>
              </div>
              <div data-orbit="follow-up" className="absolute right-[calc(50%-398px)] top-[36%] z-20 w-[214px]">
                <div data-hp-reveal="card" style={motionDelay(840)}><MobileLeadActivityCard card={MOBILE_LEAD_CARDS[4]} /></div>
              </div>
              <div data-orbit="price-change" className="absolute right-[calc(50%-412px)] top-[58%] z-20 w-[206px]">
                <div data-hp-reveal="card" style={motionDelay(980)}><MobileLeadActivityCard card={MOBILE_LEAD_CARDS[5]} /></div>
              </div>
            </div>

            <div className="relative mx-auto hidden max-w-[420px] lg:block min-[1400px]:hidden">
              <div className="pointer-events-none absolute left-1/2 top-16 h-72 w-72 -translate-x-1/2 rounded-full bg-emerald-50 blur-3xl" />
              <div className="relative mx-auto w-[280px]" data-hp-reveal="depth" style={motionDelay(80)}>
                <LeadProfilePhone />
              </div>
              <div className="relative mt-8 space-y-3">
                {MOBILE_LEAD_CARDS.map((card, index) => (
                  <div key={card.id} data-hp-reveal="card" style={motionDelay(180 + index * 70)}>
                    <MobileLeadActivityCard card={card} />
                  </div>
                ))}
              </div>
            </div>

            <div className="relative mx-auto max-w-[460px] lg:hidden" data-hp-watch>
              <div className="relative z-10 mx-auto w-[min(200px,58%)]" data-hp-reveal="depth" style={motionDelay(80)}>
                <LeadProfilePhone compact />
              </div>
              <div className="relative z-20 -mt-8">
                <svg className="pointer-events-none absolute inset-y-1 left-1/2 h-[calc(100%-8px)] w-16 -translate-x-1/2" viewBox="0 0 64 320" preserveAspectRatio="none" aria-hidden="true">
                  <path
                    className="hp-mobile-flow"
                    data-hp-draw
                    pathLength={1}
                    d="M32 0 C 52 36, 12 72, 32 108 C 54 148, 10 184, 32 220 C 52 256, 16 292, 32 320"
                    fill="none"
                    stroke="#087052"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    style={motionDelay(160)}
                  />
                </svg>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                  {MOBILE_LEAD_CARDS.map((card, index) => (
                    <div
                      key={card.id}
                      className={index % 2 === 1 ? "mt-4" : undefined}
                      data-hp-reveal="card"
                      style={motionDelay(220 + index * 80)}
                    >
                      <MobileLeadActivityCard card={card} compact />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="max-w-[520px] lg:justify-self-end">
            <p className="mb-4 text-xs font-bold tracking-[.22em] text-emerald-700 lg:mb-6" data-hp-reveal="fade">AUTOMATE. ENGAGE. CLOSE MORE.</p>
            <h2 className="text-[clamp(32px,8vw,68px)] font-semibold leading-[.98] tracking-[-.04em] text-[#0c1715] lg:text-[clamp(42px,4vw,68px)] lg:tracking-[-.055em]" data-hp-reveal="heading" style={motionDelay(70)}>
              Manage every lead,
              <br />
              <span className="text-emerald-700">on the go.</span>
            </h2>
            <p className="mt-5 text-base leading-7 text-neutral-500 lg:mt-8 lg:text-lg lg:leading-8" data-hp-reveal="body" style={motionDelay(140)}>
              Get instant updates, respond quickly and automate follow-ups — all from the HouzzatPRO mobile app.
            </p>
            <div className="mt-6 space-y-4 lg:mt-10 lg:space-y-7">
              {(
                [
                  [Bell, "Real-Time Notifications", "Get instant alerts for new leads, messages and client activity."],
                  [MapPin, "Property & Area Alerts", "Send new listings, price changes and sold data based on client interests."],
                  [Mail, "Automated Follow-Ups", "Schedule and automate emails and SMS."],
                  [Smartphone, "Manage on the Go", "Respond, share listings, book viewings and move deals forward — anytime, anywhere."],
                ] as const
              ).map(([Icon, title, copy], index) => (
                <div key={title} className="flex gap-3 lg:gap-5" data-hp-reveal="card" style={motionDelay(220 + index * 90)}>
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-700 lg:h-14 lg:w-14">
                    <Icon className="h-5 w-5 lg:h-6 lg:w-6" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-[#10201c] lg:text-lg">{title}</h3>
                    <p className="mt-1 text-base leading-6 text-neutral-500">{copy}</p>
                  </div>
                </div>
              ))}
            </div>
            <a href="#" data-hp-cta className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-xl bg-emerald-800 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-950/10 lg:mt-10 lg:gap-5 lg:px-7 lg:py-4">
              See Mobile App Features <span className="hp-cta-arrow" aria-hidden="true">→</span>
            </a>
          </div>
        </div>
      </section>

      <HomePreviewEverything />

      <HomePreviewFinalCta />

      {/* Deliberate stop point.
          Do not build later sections until this visual foundation is approved. */}
    </main>
  );
}
