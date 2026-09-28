import type { ReactNode } from "react";
import { FaqExplorer } from "@/components/platform/public/site/FaqExplorer";
import type { PublicStory, StoryShot } from "@/components/platform/public/site/public-stories";
import {
  Actions,
  CapabilityGrid,
  Closing,
  Footnote,
  Hero,
  Kicker,
  Lead,
  PathList,
  Section,
  Shell,
  Split,
  Workflow,
} from "@/components/platform/public/site/pub-ui";
import {
  ConversationStage,
  CrmStack,
  Crop,
  DeskFrame,
  DeskPair,
  DeskPeek,
  DeskPhone,
  EventStack,
  PhoneCluster,
  ProfileCallouts,
  PropertyShow,
  RouteHero,
  SearchStage,
} from "@/components/platform/public/site/pub-visuals";

function shotsOf(story: PublicStory): readonly StoryShot[] {
  return story.shots ?? [];
}

export function Narrative({ points }: { points: readonly { title: string; body: string }[] }) {
  return (
    <ul className="mt-2 max-w-[560px] space-y-5">
      {points.map((point) => (
        <li key={point.title}>
          <h3 className="text-[16px] font-extrabold text-[#14201d]">{point.title}</h3>
          <p className="mt-1 text-sm leading-6 text-[#66736f]">{point.body}</p>
        </li>
      ))}
    </ul>
  );
}

function ProductClose({ story, title, children }: { story: PublicStory; title: string; children: ReactNode }) {
  return (
    <>
      {children}
      <Footnote text={story.note} />
      <Closing title={title} />
    </>
  );
}

export function CrmPage({ story }: { story: PublicStory }) {
  const [leads, profile, conversation] = shotsOf(story);
  const points = story.points ?? [];
  return (
    <ProductClose story={story} title="See how HouzzatPRO can transform your lead management.">
      {leads && profile && conversation ? (
        <Hero
          kicker={story.kicker}
          headline={story.headline}
          lead={story.lead}
          visual={<CrmStack leads={leads} profile={profile} conversation={conversation} />}
        />
      ) : null}
      <Workflow
        eyebrow="The client journey"
        title="From a new lead to the next conversation."
        steps={[
          { title: "New lead", body: points[0]?.body ?? story.lead },
          { title: "Profile", body: points[1]?.body ?? story.lead },
          { title: "Activity", body: points[2]?.body ?? story.lead },
          { title: "Conversation", body: "Client communication stays with that record." },
          { title: "Follow-up", body: points[3]?.body ?? story.lead },
        ]}
      />
      {profile ? (
        <Split
          tone="mint"
          copy={
            <div className="max-w-[520px]">
              <Kicker>Know every client</Kicker>
              <h2 className="mt-4 text-[clamp(2rem,3.4vw,3.4rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-[#101817]">The profile is the relationship.</h2>
              <Lead>The client profile holds the details and notes your team adds. Marketing examples use the fictional client Emily Carter.</Lead>
            </div>
          }
          visual={<ProfileCallouts shot={profile} />}
        />
      ) : null}
      {profile ? (
        <Split
          tone="white"
          reverse
          copy={
            <div className="max-w-[520px]">
              <Kicker>Never lose the history</Kicker>
              <h2 className="mt-4 text-[clamp(2rem,3.4vw,3.4rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-[#101817]">The timeline stays on the lead.</h2>
              <Lead>{points[2]?.body ?? story.lead}</Lead>
            </div>
          }
          visual={<Crop shot={profile} focus="timeline" />}
        />
      ) : null}
      {conversation ? (
        <Split
          tone="paper"
          copy={
            <div className="max-w-[520px]">
              <Kicker>Keep conversations moving</Kicker>
              <h2 className="mt-4 text-[clamp(2rem,3.4vw,3.4rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-[#101817]">The conversation stays with the client.</h2>
              <Lead>Messages, notes, and the next follow-up sit on the same lead record.</Lead>
            </div>
          }
          visual={<ConversationStage panel={conversation} />}
        />
      ) : null}
    </ProductClose>
  );
}

export function WebsitePage({ story }: { story: PublicStory }) {
  const [desk, phone] = shotsOf(story);
  return (
    <ProductClose story={story} title="See the website and the lead it can create.">
      {desk && phone ? <Hero kicker={story.kicker} headline={story.headline} lead={story.lead} visual={<DeskPhone desk={desk} phone={phone} />} /> : null}
      {story.points ? <Workflow eyebrow="Visitor to lead" title="The site starts the client record." steps={story.points} /> : null}
    </ProductClose>
  );
}

export function PropertiesPage({ story }: { story: PublicStory }) {
  const [desk, phone, route] = shotsOf(story);
  return (
    <ProductClose story={story} title="See search and the viewing day together.">
      {desk && phone && route ? <Hero kicker={story.kicker} headline={story.headline} lead={story.lead} visual={<PropertyShow desk={desk} phone={phone} route={route} />} /> : null}
      {story.steps ? <Workflow eyebrow="The showing day" title="Choose the homes, then take the plan." steps={story.steps} /> : null}
    </ProductClose>
  );
}

export function PlannerPage({ story }: { story: PublicStory }) {
  const [phone, route] = shotsOf(story);
  return (
    <ProductClose story={story} title="See a viewing day planned in HouzzatPRO.">
      {phone && route ? <Hero kicker={story.kicker} headline={story.headline} lead={story.lead} visual={<RouteHero phone={phone} route={route} />} /> : null}
      {story.points ? <Workflow eyebrow="The plan" title="Homes, order, and the road between them." steps={story.points} /> : null}
    </ProductClose>
  );
}

export function MobilePage({ story }: { story: PublicStory }) {
  return (
    <ProductClose story={story} title="See HouzzatPRO Mobile with your leads.">
      <Hero kicker={story.kicker} headline={story.headline} lead={story.lead} visual={<PhoneCluster shots={shotsOf(story)} />} />
      {story.points ? <Workflow eyebrow="Away from the desk" title="The same record, on the phone." steps={story.points} /> : null}
    </ProductClose>
  );
}

export function SearchPage({ story }: { story: PublicStory }) {
  const shot = shotsOf(story)[0];
  return (
    <ProductClose story={story} title="See property search connected to the client.">
      {shot ? <Hero kicker={story.kicker} headline={story.headline} lead={story.lead} visual={<SearchStage shot={shot} />} /> : null}
      {story.points ? <Workflow eyebrow="Inside search" title="Discovery that stays with the client." steps={story.points} /> : null}
    </ProductClose>
  );
}

export function FlowProduct({
  story,
  title,
  eyebrow,
  visualCaption,
}: {
  story: PublicStory;
  title: string;
  eyebrow: string;
  visualCaption?: string;
}) {
  const shot = shotsOf(story)[0];
  const steps = story.steps ?? [];
  return (
    <ProductClose story={story} title={title}>
      <Hero
        kicker={story.kicker}
        headline={story.headline}
        lead={story.lead}
        visual={shot && visualCaption ? <DeskPeek shot={shot} caption={visualCaption} /> : <EventStack steps={steps} />}
      />
      {shot && visualCaption && steps.length > 0 ? <Workflow eyebrow={eyebrow} title={eyebrow} steps={steps} /> : null}
    </ProductClose>
  );
}

export function AudiencePage({
  story,
  title,
  journey,
  visual,
  steps,
}: {
  story: PublicStory;
  title: string;
  journey: string;
  visual: ReactNode;
  steps: readonly { title: string; body: string }[];
}) {
  return (
    <ProductClose story={story} title={title}>
      <Hero kicker={story.kicker} headline={story.headline} lead={story.lead} visual={visual} />
      <Workflow eyebrow={story.kicker} title={journey} steps={steps} />
    </ProductClose>
  );
}

export function GoalPage({ story, title, visual }: { story: PublicStory; title: string; visual?: ReactNode }) {
  return (
    <>
      <Hero kicker={story.kicker} headline={story.headline} lead={story.lead} visual={visual ?? null} tall={false} />
      {story.links ? (
        <Section tone="white">
          <Shell className="py-16 lg:py-20">
            <PathList links={story.links} />
          </Shell>
        </Section>
      ) : null}
      <Closing title={title} />
    </>
  );
}

export function HubPage({ story }: { story: PublicStory }) {
  return (
    <>
      <Section tone="paper">
        <Shell className="py-20 lg:py-28">
          <div className="max-w-[860px]">
            <Kicker>{story.kicker}</Kicker>
            <h1 className="mt-4 text-[clamp(2.4rem,5vw,4.4rem)] font-semibold leading-[0.98] tracking-[-0.048em] text-[#101817]">{story.headline}</h1>
            <Lead>{story.lead}</Lead>
            <Actions pricing={false} />
          </div>
        </Shell>
      </Section>
      {story.points ? (
        <Section tone="mint">
          <Shell className="py-16 lg:py-24">
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {story.points.map((point) => (
                <article key={point.title} className="rounded-3xl border border-[#d7e6dc] bg-white p-6">
                  <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-[#101817]">{point.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-[#66736f]">{point.body}</p>
                </article>
              ))}
            </div>
          </Shell>
        </Section>
      ) : null}
    </>
  );
}

export function PricingPage({ story }: { story: PublicStory }) {
  return (
    <>
      <Section tone="paper">
        <Shell className="py-20 lg:py-28">
          <div className="max-w-[760px]">
            <Kicker>{story.kicker}</Kicker>
            <h1 className="mt-4 text-[clamp(2.4rem,5vw,4.4rem)] font-semibold leading-[0.98] tracking-[-0.048em] text-[#101817]">{story.headline}</h1>
            <Lead>{story.lead}</Lead>
            <Actions pricing={false} />
          </div>
        </Shell>
      </Section>
      {story.points ? <CapabilityGrid title="What the proposal reflects" points={story.points} /> : null}
      <Workflow
        eyebrow="What happens next"
        title="A demo, then a private proposal."
        steps={[
          { title: "Book a demo", body: "See the website, CRM, properties, viewings, and mobile app." },
          { title: "We learn the operation", body: "Setup, seats, and the capabilities you need." },
          { title: "Private proposal", body: "Commercial terms are delivered after the demo, not on this page." },
        ]}
      />
      {story.groups ? (
        <Section tone="paper">
          <Shell className="py-16 lg:py-24">
            <FaqExplorer groups={story.groups} />
          </Shell>
        </Section>
      ) : null}
      <Footnote text={story.note} />
      <div className="bg-white">
        <Shell className="pb-8">
          <p className="max-w-[640px] text-sm leading-6 text-[#53635e]">Existing customers sign in from the header. New conversations start with a demo.</p>
        </Shell>
      </div>
      <Closing title="Book a demo and request a private proposal." />
    </>
  );
}

export function PlatformPage({ story }: { story: PublicStory }) {
  const shot = shotsOf(story)[0];
  return (
    <>
      {shot ? <Hero kicker={story.kicker} headline={story.headline} lead={story.lead} visual={<DeskFrame shot={shot} />} /> : null}
      {story.steps ? <Workflow eyebrow="The client journey" title="Every step stays on one record." steps={story.steps} /> : null}
      {story.links ? (
        <Section tone="mint">
          <Shell className="py-16 lg:py-24">
            <h2 className="mb-8 max-w-[14ch] text-[clamp(2rem,3.2vw,3.2rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-[#101817]">Go further</h2>
            <PathList links={story.links} />
          </Shell>
        </Section>
      ) : null}
      <Closing title="See the whole HouzzatPRO client journey." />
    </>
  );
}

export function ConversationsPage({ story }: { story: PublicStory }) {
  const [panel, phone] = story.shots ?? [];
  return (
    <ProductClose story={story} title="See conversations stay on the lead.">
      {panel ? <Hero kicker={story.kicker} headline={story.headline} lead={story.lead} visual={<ConversationStage panel={panel} phone={phone} />} /> : null}
      {story.points ? (
        <Section tone="white">
          <Shell className="grid items-start gap-12 py-16 lg:grid-cols-[0.8fr_1.2fr] lg:py-24">
            <div>
              <Kicker>On the record</Kicker>
              <h2 className="mt-4 text-[clamp(2rem,3.2vw,3.2rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-[#101817]">History does not leave with one person.</h2>
            </div>
            <Narrative points={story.points} />
          </Shell>
        </Section>
      ) : null}
    </ProductClose>
  );
}

export function AlertsPage({ story }: { story: PublicStory }) {
  return (
    <ProductClose story={story} title="See follow-up stay on the client record.">
      <Hero kicker={story.kicker} headline={story.headline} lead={story.lead} visual={<EventStack steps={story.steps ?? []} />} />
    </ProductClose>
  );
}
export function FaqPage({ story }: { story: PublicStory }) {
  return (
    <Section tone="paper">
      <Shell className="py-16 lg:py-24">
        <div className="mx-auto max-w-[760px]">
          <Kicker>{story.kicker}</Kicker>
          <h1 className="mt-4 text-[clamp(2.4rem,5vw,4.2rem)] font-semibold leading-[0.98] tracking-[-0.048em] text-[#101817]">{story.headline}</h1>
          <Lead>{story.lead}</Lead>
        </div>
        <div className="mt-12">{story.groups ? <FaqExplorer groups={story.groups} /> : null}</div>
      </Shell>
    </Section>
  );
}

export function ContactPage({ story }: { story: PublicStory }) {
  return (
    <Section tone="paper">
      <Shell className="py-16 lg:py-24">
        <Kicker>{story.kicker}</Kicker>
        <h1 className="mt-4 max-w-[16ch] text-[clamp(2.4rem,5vw,4.2rem)] font-semibold leading-[0.98] tracking-[-0.048em] text-[#101817]">{story.headline}</h1>
        <Lead>{story.lead}</Lead>
        <div className="mt-12">{story.links ? <PathList links={story.links} /> : null}</div>
        <p className="mt-10 max-w-[640px] text-sm leading-6 text-[#5d726a]">
          Existing customers can email <a className="font-bold text-[#07583f]" href="mailto:support@houzzatpro.com">support@houzzatpro.com</a>. Replies are typically within one business day.
        </p>
      </Shell>
    </Section>
  );
}
