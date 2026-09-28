import Image from "next/image";
import type { StoryShot } from "@/components/platform/public/site/public-stories";

function Shot({ shot, className }: { shot: StoryShot; className?: string }) {
  return (
    <Image
      src={shot.src}
      alt={shot.alt}
      width={shot.width}
      height={shot.height}
      unoptimized
      className={className ?? "h-auto w-full"}
    />
  );
}

function Chip({ label, detail, className }: { label: string; detail: string; className: string }) {
  return (
    <div className={`rounded-2xl border border-[#dcebe3] bg-white/95 px-3 py-2 shadow-[0_16px_40px_rgba(16,42,34,0.16)] backdrop-blur ${className}`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#72817c]">{label}</p>
      <p className="mt-0.5 text-sm font-extrabold text-[#07583f]">{detail}</p>
    </div>
  );
}

export function CrmStack({ leads, profile, conversation }: { leads: StoryShot; profile: StoryShot; conversation: StoryShot }) {
  return (
    <div className="relative mx-auto w-full max-w-[760px] lg:min-h-[620px] lg:max-w-none">
      <div className="relative z-10 w-[88%] overflow-hidden rounded-[18px] border border-white bg-white p-1.5 shadow-[0_24px_60px_rgba(19,48,39,0.14)] lg:absolute lg:left-0 lg:top-[4%] lg:w-[74%]">
        <Shot shot={leads} />
      </div>
      <div className="relative z-20 -mt-10 ml-auto w-[86%] overflow-hidden rounded-[18px] border border-white bg-white p-1.5 shadow-[0_28px_70px_rgba(18,49,39,0.2)] lg:absolute lg:right-0 lg:top-[26%] lg:mt-0 lg:w-[70%]">
        <Shot shot={profile} />
      </div>
      <div className="relative z-30 -mt-8 w-[64%] overflow-hidden rounded-[16px] border border-white bg-white p-1 shadow-[0_22px_50px_rgba(16,42,34,0.22)] lg:absolute lg:bottom-[8%] lg:left-[6%] lg:mt-0 lg:w-[46%]">
        <Shot shot={conversation} />
      </div>
      <Chip label="Client journey" detail="Lead → Profile → Conversation" className="relative z-40 mt-4 lg:absolute lg:bottom-[4%] lg:right-[2%] lg:mt-0" />
    </div>
  );
}

export function ProfileCallouts({ shot }: { shot: StoryShot }) {
  const labels = ["Preferences", "Notes", "Activity", "Assignment"] as const;
  return (
    <div className="relative lg:min-h-[520px]">
      <div className="overflow-hidden rounded-[24px] border border-white bg-[#10201c] shadow-[0_28px_70px_rgba(16,40,32,0.18)] lg:absolute lg:inset-y-0 lg:right-0 lg:w-[78%]">
        <Shot shot={shot} className="h-[300px] w-full object-cover object-[78%_18%] sm:h-[380px] lg:h-full" />
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-3 lg:absolute lg:bottom-8 lg:left-0 lg:mt-0 lg:w-[240px]">
        {labels.map((label) => (
          <li key={label} className="rounded-2xl border border-[#d7e6dc] bg-white px-3 py-3 text-sm font-extrabold text-[#10201c] shadow-[0_12px_30px_rgba(16,40,32,0.08)]">
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DeskPhone({ desk, phone }: { desk: StoryShot; phone: StoryShot }) {
  return (
    <div className="relative mx-auto w-full max-w-[720px] lg:min-h-[560px] lg:max-w-none">
      <div className="relative z-10 w-[92%] overflow-hidden rounded-[22px] border-[8px] border-[#111918] bg-[#111918] shadow-[0_32px_75px_rgba(12,40,31,0.22)] lg:absolute lg:left-0 lg:top-[6%] lg:w-[86%]">
        <Shot shot={desk} className="h-auto w-full rounded-[12px]" />
      </div>
      <div className="relative z-20 -mt-16 ml-auto w-[38%] min-w-[108px] max-w-[190px] overflow-hidden rounded-[28px] border-[7px] border-[#101716] bg-[#101716] shadow-[0_28px_60px_rgba(10,34,27,0.28)] lg:absolute lg:bottom-[2%] lg:right-[2%] lg:mt-0 lg:w-[28%]">
        <Shot shot={phone} />
      </div>
    </div>
  );
}

export function SearchStage({ shot }: { shot: StoryShot }) {
  return (
    <div className="relative pb-8">
      <div className="pointer-events-none absolute -left-8 top-8 h-40 w-40 rounded-full bg-[#bcebd1]/70 blur-3xl" />
      <div className="relative overflow-hidden rounded-[28px] border border-white bg-white shadow-[0_30px_70px_rgba(16,40,32,0.16)]">
        <Shot shot={shot} className="h-[240px] w-full object-cover object-[70%_40%] sm:h-[340px] lg:h-[440px]" />
      </div>
      <Chip label="This workspace" detail="Listings it is set up to show" className="absolute bottom-0 left-4 z-10 sm:left-8" />
    </div>
  );
}

export function PropertyShow({ desk, phone, route }: { desk: StoryShot; phone: StoryShot; route: StoryShot }) {
  return (
    <div className="relative lg:min-h-[640px]">
      <div className="pointer-events-none absolute inset-x-[-4%] bottom-0 opacity-80">
        <Shot shot={route} className="h-auto w-full object-contain" />
      </div>
      <div className="relative z-10 w-[92%] overflow-hidden rounded-[22px] border-[8px] border-[#111918] bg-[#111918] shadow-[0_28px_70px_rgba(12,40,31,0.2)] lg:absolute lg:left-0 lg:top-0 lg:w-[84%]">
        <Shot shot={desk} className="h-auto w-full rounded-[10px]" />
      </div>
      <div className="relative z-20 -mt-16 ml-auto w-[36%] min-w-[108px] max-w-[180px] overflow-hidden rounded-[28px] border-[7px] border-[#101716] bg-[#101716] shadow-[0_24px_55px_rgba(10,34,27,0.28)] lg:absolute lg:bottom-[12%] lg:right-0 lg:mt-0 lg:w-[26%]">
        <Shot shot={phone} />
      </div>
      <Chip label="Example day" detail="5 viewings · 20.0 km" className="relative z-30 mt-4 lg:absolute lg:bottom-[4%] lg:left-[6%] lg:mt-0" />
    </div>
  );
}

export function RouteHero({ phone, route }: { phone: StoryShot; route: StoryShot }) {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-[-6%] bottom-16 opacity-75">
        <Shot shot={route} className="h-auto w-full object-contain" />
      </div>
      <div className="relative z-20 mx-auto w-[min(230px,62%)] overflow-hidden rounded-[32px] border-[8px] border-[#101716] bg-[#101716] shadow-[0_30px_70px_rgba(10,34,27,0.28)]">
        <Shot shot={phone} />
      </div>
      <div className="relative z-30 mt-4 flex flex-wrap justify-center gap-2">
        <Chip label="Example" detail="5 viewings" className="" />
        <Chip label="Example" detail="20.0 km" className="" />
        <Chip label="Example" detail="1 hr 10 min" className="" />
      </div>
    </div>
  );
}

export function PhoneCluster({ shots }: { shots: readonly StoryShot[] }) {
  const places = [
    "left-[4%] top-[8%] z-10 w-[34%]",
    "left-[33%] top-0 z-20 w-[34%]",
    "right-[4%] top-[14%] z-30 w-[34%]",
  ];
  return (
    <div className="relative mx-auto h-[420px] max-w-[560px] sm:h-[520px] lg:h-[600px] lg:max-w-none">
      {shots.slice(0, 3).map((shot, index) => (
        <div key={shot.src} className={`absolute overflow-hidden rounded-[30px] border-[7px] border-[#101716] bg-[#101716] shadow-[0_24px_55px_rgba(10,34,27,0.24)] ${places[index] ?? places[0]}`}>
          <Shot shot={shot} />
        </div>
      ))}
    </div>
  );
}

export function ConversationStage({ panel, phone }: { panel: StoryShot; phone?: StoryShot }) {
  return (
    <div className="relative lg:min-h-[520px]">
      <div className="relative z-10 w-[90%] overflow-hidden rounded-[22px] border border-white bg-white p-1.5 shadow-[0_28px_64px_rgba(16,40,32,0.16)] lg:absolute lg:left-0 lg:top-[8%] lg:w-[82%]">
        <Shot shot={panel} />
      </div>
      {phone ? (
        <div className="relative z-20 -mt-16 ml-auto w-[36%] min-w-[108px] max-w-[180px] overflow-hidden rounded-[28px] border-[7px] border-[#101716] bg-[#101716] shadow-[0_24px_50px_rgba(10,34,27,0.26)] lg:absolute lg:bottom-0 lg:right-0 lg:mt-0 lg:w-[28%]">
          <Shot shot={phone} />
        </div>
      ) : null}
    </div>
  );
}

export function EventStack({ steps }: { steps: readonly { title: string; body: string }[] }) {
  return (
    <div className="relative mx-auto flex min-h-[360px] max-w-[460px] flex-col justify-center gap-3 lg:min-h-[480px]">
      {steps.map((step, index) => (
        <article
          key={step.title}
          className={`rounded-3xl border border-[#d7e6dc] bg-white px-5 py-4 shadow-[0_18px_40px_rgba(16,40,32,0.08)] ${index % 2 === 0 ? "" : "ml-4 sm:ml-7"}`}
        >
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#087052]">{String(index + 1).padStart(2, "0")}</p>
          <h3 className="mt-1 text-[17px] font-semibold tracking-[-0.02em] text-[#101817]">{step.title}</h3>
          <p className="mt-1 text-sm leading-6 text-[#66736f]">{step.body}</p>
        </article>
      ))}
    </div>
  );
}

export function Crop({ shot, focus }: { shot: StoryShot; focus: "profile" | "timeline" }) {
  const position = focus === "profile" ? "object-[74%_18%]" : "object-bottom";
  return (
    <div className="overflow-hidden rounded-[24px] border border-white bg-white shadow-[0_24px_60px_rgba(16,40,32,0.14)]">
      <Shot shot={shot} className={`h-[280px] w-full object-cover sm:h-[420px] ${position}`} />
    </div>
  );
}

export function DeskFrame({ shot }: { shot: StoryShot }) {
  return (
    <div className="overflow-hidden rounded-[22px] border-[8px] border-[#111918] bg-[#111918] shadow-[0_28px_70px_rgba(12,40,31,0.2)]">
      <Shot shot={shot} className="h-auto w-full rounded-[10px]" />
    </div>
  );
}

export function DeskPair({ back, front }: { back: StoryShot; front: StoryShot }) {
  return (
    <div className="relative lg:min-h-[460px]">
      <div className="relative z-10 w-[86%] overflow-hidden rounded-[20px] border-[8px] border-[#111918] bg-[#111918] shadow-[0_20px_50px_rgba(12,40,31,0.16)] lg:absolute lg:left-0 lg:top-0 lg:w-[78%]">
        <Shot shot={back} className="h-auto w-full rounded-[8px]" />
      </div>
      <div className="relative z-20 -mt-16 ml-auto w-[80%] overflow-hidden rounded-[20px] border-[8px] border-[#101716] bg-[#101716] shadow-[0_28px_60px_rgba(12,40,31,0.24)] lg:absolute lg:bottom-0 lg:right-0 lg:mt-0 lg:w-[72%]">
        <Shot shot={front} className="h-auto w-full rounded-[8px]" />
      </div>
    </div>
  );
}

export function DeskPeek({ shot, caption }: { shot: StoryShot; caption: string }) {
  return (
    <div className="relative">
      <div className="ml-auto w-[86%] overflow-hidden rounded-[22px] border-[8px] border-[#111918] bg-[#111918] shadow-[0_28px_70px_rgba(12,40,31,0.2)]">
        <Shot shot={shot} className="h-[240px] w-full rounded-[10px] object-cover object-left sm:h-[320px]" />
      </div>
      <Chip label="From the site" detail={caption} className="absolute -bottom-3 left-0" />
    </div>
  );
}
