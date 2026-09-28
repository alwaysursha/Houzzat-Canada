import type { PublicStory } from "@/components/platform/public/site/public-stories";
import { Crop, DeskFrame, DeskPair, PhoneCluster } from "@/components/platform/public/site/pub-visuals";
import {
  AlertsPage,
  AudiencePage,
  ContactPage,
  ConversationsPage,
  CrmPage,
  FaqPage,
  FlowProduct,
  GoalPage,
  HubPage,
  MobilePage,
  PlannerPage,
  PlatformPage,
  PricingPage,
  PropertiesPage,
  SearchPage,
  WebsitePage,
} from "@/components/platform/public/site/story-pages";

export function PublicStoryView({ story }: { story: PublicStory }) {
  const path = story.path;
  const shots = story.shots ?? [];
  const first = shots[0];
  const second = shots[1];

  switch (path) {
    case "/product":
      return <PlatformPage story={story} />;
    case "/product/crm":
      return <CrmPage story={story} />;
    case "/product/website":
      return <WebsitePage story={story} />;
    case "/product/properties":
      return <PropertiesPage story={story} />;
    case "/product/viewing-planner":
      return <PlannerPage story={story} />;
    case "/product/mobile":
      return <MobilePage story={story} />;
    case "/product/mls-search":
      return <SearchPage story={story} />;
    case "/product/lead-routing":
      return <FlowProduct story={story} title="See how a new lead reaches an agent." eyebrow="Lead captured to follow-up" />;
    case "/product/lead-capture":
      return <FlowProduct story={story} title="See a visitor become a lead someone owns." eyebrow="Visitor to a lead" visualCaption="Website visitor" />;
    case "/product/conversations":
      return <ConversationsPage story={story} />;
    case "/product/alerts":
      return <AlertsPage story={story} />;
    case "/solutions/agents":
      return (
        <AudiencePage
          story={story}
          title="See HouzzatPRO for an individual agent."
          journey="Brand, leads, showings, and follow-up."
          visual={first ? <DeskFrame shot={first} /> : <div />}
          steps={story.steps ?? []}
        />
      );
    case "/solutions/teams":
      return (
        <AudiencePage
          story={story}
          title="See how a team works the same client."
          journey="One record the whole team can continue."
          visual={first ? <Crop shot={first} focus="profile" /> : <div />}
          steps={story.points ?? []}
        />
      );
    case "/solutions/brokerages":
      return (
        <AudiencePage
          story={story}
          title="See a branded system agents can share."
          journey="The site and the agent’s lead record."
          visual={first && second ? <DeskPair back={first} front={second} /> : first ? <DeskFrame shot={first} /> : <div />}
          steps={story.points ?? []}
        />
      );
    case "/solutions/generate-leads":
      return <GoalPage story={story} title="See how the site creates a lead." />;
    case "/solutions/convert-leads":
      return <GoalPage story={story} title="See the record that carries a lead forward." />;
    case "/solutions/client-experience":
      return <GoalPage story={story} title="See search, conversation, and the viewing day." />;
    case "/solutions/work-from-anywhere":
      return <GoalPage story={story} title="See the lead record on the phone." visual={shots.length > 0 ? <PhoneCluster shots={shots} /> : undefined} />;
    case "/pricing":
      return <PricingPage story={story} />;
    case "/resources":
    case "/blog":
    case "/product-updates":
    case "/customer-stories":
      return <HubPage story={story} />;
    case "/faq":
      return <FaqPage story={story} />;
    case "/contact":
      return <ContactPage story={story} />;
    default: {
      const exhaustive: never = path;
      return exhaustive;
    }
  }
}
