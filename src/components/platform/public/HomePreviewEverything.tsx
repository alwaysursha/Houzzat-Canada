import type { CSSProperties } from "react";
import {
  Bell,
  CalendarDays,
  ChartNoAxesColumn,
  House,
  MessageCircle,
  Monitor,
  Smartphone,
  UsersRound,
} from "lucide-react";

const items = [
  {
    icon: UsersRound,
    title: "CRM & Lead Management",
    description: "Keep all your leads, conversations and client activity in one place.",
  },
  {
    icon: House,
    title: "MLS® Search Integration",
    description: "Access live listings, sold data and market insights across Canada.",
  },
  {
    icon: Monitor,
    title: "Consumer Website",
    description: "Generate your own leads with a modern, fully branded website.",
  },
  {
    icon: Smartphone,
    title: "Mobile App",
    description: "Manage leads, respond to clients and stay productive on the go.",
  },
  {
    icon: MessageCircle,
    title: "Communications",
    description: "Chat, email and SMS — all from one integrated platform.",
  },
  {
    icon: CalendarDays,
    title: "Viewing Planner",
    description: "Help clients plan and organize property viewings with ease.",
  },
  {
    icon: Bell,
    title: "Alerts & Automation",
    description: "Send new listings, price changes and follow-ups automatically.",
  },
  {
    icon: ChartNoAxesColumn,
    title: "Market Insights",
    description: "Give your clients the data they need to make confident decisions.",
  },
] as const;

function motionDelay(ms: number): CSSProperties {
  return { "--hp-delay": `${ms}ms` } as CSSProperties;
}

export function HomePreviewEverything() {
  return (
    <section aria-labelledby="everything-title" className="relative isolate overflow-hidden bg-white py-12 lg:py-[108px]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute left-[-15%] top-[23%] h-[65%] w-[57%] rounded-full bg-[#e7fff5]/60 blur-[100px]" />
        <div className="absolute right-[-15%] top-[22%] h-[65%] w-[57%] rounded-full bg-[#e7fff5]/60 blur-[100px]" />
        <svg className="hp-parallax hp-parallax-soft absolute inset-0 h-full w-full" viewBox="0 0 1440 780" preserveAspectRatio="none" fill="none" aria-hidden="true">
          <path d="M-115 132 C 75 90, 205 165, 314 310" stroke="#c4e9dd" strokeWidth="1" />
          <path d="M-105 190 C 95 147, 232 195, 360 325" stroke="#c4e9dd" strokeWidth="1" />
          <path d="M1555 132 C 1365 90, 1235 165, 1126 310" stroke="#c4e9dd" strokeWidth="1" />
          <path d="M1545 190 C 1345 147, 1208 195, 1080 325" stroke="#c4e9dd" strokeWidth="1" />
          <circle cx="235" cy="184" r="6" fill="#a7dfcc" />
          <circle cx="1205" cy="184" r="6" fill="#a7dfcc" />
          <circle cx="1358" cy="115" r="6" fill="#007c59" />
        </svg>
      </div>
      <div className="relative mx-auto max-w-[1480px] px-5 sm:px-8 lg:px-10">
        <header className="mx-auto mb-6 max-w-[900px] text-center lg:mb-14">
          <p className="mb-3 text-[12px] font-bold uppercase tracking-[.22em] text-[#006f50] sm:text-[14px] lg:mb-5 lg:tracking-[.28em]" data-hp-reveal="fade">Everything in one platform</p>
          <h2 id="everything-title" className="text-[clamp(30px,8vw,66px)] font-semibold leading-[1.08] tracking-[-.04em] text-[#111c1c] lg:text-[clamp(36px,4.4vw,66px)] lg:tracking-[-.052em]" data-hp-reveal="heading" style={motionDelay(80)}>
            Everything you need to grow,<br className="hidden sm:block" /> <span className="text-[#007b58]">in one platform.</span>
          </h2>
            <p className="mx-auto mt-3 max-w-[760px] text-[15px] leading-[1.5] text-[#66717b] sm:mt-5 sm:text-[19px] sm:leading-[1.55]" data-hp-reveal="body" style={motionDelay(150)}>
            From lead generation to closed deals, HouzzatPRO gives you the tools<br className="hidden lg:block" /> to manage, engage and convert — all in one place.
          </p>
        </header>
        <div className="grid grid-cols-2 gap-2.5 max-[359px]:grid-cols-1 sm:gap-5 xl:grid-cols-4 xl:gap-6">
          {items.map(({ icon: Icon, title, description }, index) => (
            <article key={title} data-hp-reveal="card" data-hp-card style={motionDelay(180 + index * 70)} className="rounded-[18px] border border-[#dceee8] bg-white/95 p-3 shadow-[0_12px_35px_rgba(12,92,67,0.035)] lg:min-h-[220px] lg:rounded-[22px] lg:p-7">
              <span className="hp-card-icon mb-2.5 flex h-10 w-10 items-center justify-center rounded-full bg-[#e3faf1] text-[#007c59] lg:mb-5 lg:h-[58px] lg:w-[58px]">
                <Icon className="h-5 w-5 lg:h-[29px] lg:w-[29px]" strokeWidth={1.8} aria-hidden="true" />
              </span>
              <h3 className="mb-1 text-[14px] font-semibold leading-[1.2] tracking-[-.02em] text-[#152022] lg:mb-2 lg:text-[19px] lg:tracking-[-.025em]">{title}</h3>
              <p className="text-[12px] leading-[1.4] text-[#65717c] lg:text-[16px] lg:leading-[1.48]">{description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
