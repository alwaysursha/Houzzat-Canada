import type { OwnedChromePath } from "@/lib/platform/public/public-site-paths";

export type StoryKind =
  | "overview"
  | "split"
  | "flow"
  | "phones"
  | "audience"
  | "goal"
  | "pricing"
  | "hub"
  | "faq"
  | "contact";

export type StoryShot = {
  src: string;
  alt: string;
  width: number;
  height: number;
};

export type StoryLink = {
  href: string;
  title: string;
  body: string;
};

export type PublicStory = {
  path: OwnedChromePath;
  title: string;
  description: string;
  kicker: string;
  headline: string;
  lead: string;
  kind: StoryKind;
  shots?: readonly StoryShot[];
  steps?: readonly { title: string; body: string }[];
  points?: readonly { title: string; body: string }[];
  links?: readonly StoryLink[];
  note?: string;
  groups?: readonly { heading: string; items: readonly { q: string; a: string }[] }[];
};

const crm: StoryShot = {
  src: "/images/home-preview/houzzatpro-crm-leads.png",
  alt: "HouzzatPRO leads table using the fictional client Emily Carter",
  width: 1440,
  height: 900,
};
const activity: StoryShot = {
  src: "/images/home-preview/houzzatpro-lead-activity.png",
  alt: "HouzzatPRO lead activity for the fictional client Emily Carter",
  width: 1440,
  height: 900,
};
const conversation: StoryShot = {
  src: "/images/home-preview/houzzatpro-lead-conversation.png",
  alt: "HouzzatPRO conversation view for the fictional client Emily Carter",
  width: 800,
  height: 900,
};
const siteDesk: StoryShot = {
  src: "/images/home-preview/houzzatpro-consumer-desktop.png",
  alt: "HouzzatPRO consumer website on a desktop screen",
  width: 1440,
  height: 900,
};
const sitePhone: StoryShot = {
  src: "/images/home-preview/houzzatpro-consumer-mobile.png",
  alt: "HouzzatPRO consumer website on a phone",
  width: 390,
  height: 844,
};
const properties: StoryShot = {
  src: "/images/home-preview/houzzatpro-properties-desktop.png",
  alt: "HouzzatPRO property search on desktop",
  width: 1440,
  height: 900,
};
const planner: StoryShot = {
  src: "/images/home-preview/houzzatpro-viewing-planner-mobile.png",
  alt: "HouzzatPRO viewing planner on a phone, showing a sample route of five viewings",
  width: 390,
  height: 844,
};
const profile: StoryShot = {
  src: "/images/home-preview/houzzatpro-mobile-lead-profile.png?v=5",
  alt: "HouzzatPRO mobile lead profile for the fictional client Emily Carter",
  width: 390,
  height: 844,
};
const launchMobile: StoryShot = {
  src: "/images/home-preview/houzzatpro-launchpad-mobile.png",
  alt: "HouzzatPRO mobile home screen",
  width: 390,
  height: 844,
};
const launchDesk: StoryShot = {
  src: "/images/home-preview/houzzatpro-launchpad-desktop.png",
  alt: "HouzzatPRO desktop launchpad",
  width: 1440,
  height: 900,
};
const route: StoryShot = {
  src: "/images/home-preview/houzzatpro-neighbourhood-route-background.png?v=3",
  alt: "Illustrated neighbourhood route used in HouzzatPRO viewing marketing",
  width: 1200,
  height: 800,
};

export const PUBLIC_STORIES: readonly PublicStory[] = [
  {
    path: "/product",
    title: "The Platform | HouzzatPRO",
    description:
      "See how HouzzatPRO connects the real estate client journey, from the website and property search through CRM, viewings, and mobile follow-up.",
    kicker: "The platform",
    headline: "One platform. Every step of the client journey.",
    lead: "HouzzatPRO connects the website people visit, the properties they explore, and the lead record your team works from.",
    kind: "overview",
    shots: [launchDesk],
    steps: [
      { title: "Lead capture", body: "A website visit and property action can become a lead." },
      { title: "CRM", body: "The lead, notes, status, and activity stay together." },
      { title: "Conversations", body: "Client communication stays with that record." },
      { title: "Properties", body: "Search and showings stay tied to the client." },
      { title: "Viewings", body: "A viewing day can be planned and taken on the road." },
      { title: "Follow-up", body: "What happened remains visible for the next conversation." },
    ],
    links: [
      { href: "/product/crm", title: "CRM & Lead Management", body: "The record for every lead." },
      { href: "/product/website", title: "Real Estate Website", body: "The branded site that starts the journey." },
      { href: "/product/properties", title: "Properties & Viewings", body: "Search, showings, and the plan between them." },
      { href: "/product/mobile", title: "HouzzatPRO Mobile", body: "The same work, away from the desk." },
    ],
  },
  {
    path: "/product/crm",
    title: "CRM & Lead Management | HouzzatPRO",
    description:
      "Organize HouzzatPRO leads, profiles, notes, status, assignment, and activity in one client record.",
    kicker: "CRM",
    headline: "Every lead. Every conversation. One place.",
    lead: "The HouzzatPRO lead record keeps the person, their activity, and the next follow-up together. Marketing examples use the fictional client Emily Carter.",
    kind: "split",
    shots: [crm, activity],
    points: [
      { title: "Lead list", body: "See who needs attention without keeping a second spreadsheet." },
      { title: "Profile and notes", body: "The client profile holds the details and notes your team adds." },
      { title: "Activity", body: "A timeline shows what already happened on that lead." },
      { title: "Status and assignment", body: "A lead has a status and can be assigned to an agent." },
    ],
    note: "Screens use the fictional marketing identity Emily Carter. They are not a real customer.",
  },
  {
    path: "/product/lead-routing",
    title: "Lead Routing | HouzzatPRO",
    description:
      "See how a new HouzzatPRO lead can be assigned to an agent so follow-up can start.",
    kicker: "Routing",
    headline: "A new lead should reach the right agent.",
    lead: "HouzzatPRO can assign a new lead using the workspace’s routing settings, so the next follow-up has an owner.",
    kind: "flow",
    steps: [
      { title: "New lead", body: "Someone becomes a lead from the website or another intake path the workspace uses." },
      { title: "Routing", body: "The workspace’s routing settings decide how that lead is distributed." },
      { title: "Assigned agent", body: "The lead is assigned so one person owns the next step." },
      { title: "Follow-up", body: "The assigned agent works from the same lead record." },
    ],
    note: "Routing follows the settings configured for that workspace. This page does not describe internal security controls.",
  },
  {
    path: "/product/conversations",
    title: "Conversations | HouzzatPRO",
    description:
      "Keep HouzzatPRO client communication and activity on the lead record, including when the lead is reassigned.",
    kicker: "Conversations",
    headline: "The relationship stays with the lead.",
    lead: "Conversation history and activity sit on the lead record. If the lead is reassigned, the next person can see what already happened.",
    kind: "split",
    shots: [conversation, profile],
    points: [
      { title: "History", body: "Messages stay with the client, not in a separate inbox that nobody else can find." },
      { title: "Activity", body: "Notes and activity remain on the same record as the conversation." },
      { title: "Reassignment", body: "The record stays intact when a different agent is assigned." },
      { title: "Mobile", body: "The lead profile is available in HouzzatPRO Mobile." },
    ],
    note: "Available communication channels are the ones the workspace has set up. This page does not add new channels.",
  },
  {
    path: "/product/website",
    title: "Real Estate Website | HouzzatPRO",
    description:
      "A branded HouzzatPRO consumer website for property discovery, with activity that can become a lead in the CRM.",
    kicker: "Your website",
    headline: "Your brand. Your website. Your leads.",
    lead: "The consumer website is the public front of the same HouzzatPRO system. People discover properties there, and the activity that follows can become a lead your team works in the CRM.",
    kind: "split",
    shots: [siteDesk, sitePhone],
    points: [
      { title: "Branded experience", body: "The site presents the agent, team, or brokerage brand." },
      { title: "Property discovery", body: "Visitors browse listings on desktop and on a phone." },
      { title: "Lead capture", body: "The actions the workspace enables can create a lead." },
      { title: "Connected, not a brochure", body: "The site is part of HouzzatPRO, so the lead does not stay trapped on the marketing site." },
    ],
  },
  {
    path: "/product/mls-search",
    title: "MLS® Property Search | HouzzatPRO",
    description:
      "Property search inside HouzzatPRO for the listings available to that workspace, connected to client activity.",
    kicker: "Property search",
    headline: "Search that stays connected to the client.",
    lead: "Clients search the listings available to that HouzzatPRO workspace. Saved and viewing activity can remain with the client record instead of disappearing after the session.",
    kind: "split",
    shots: [properties],
    points: [
      { title: "Discovery", body: "List and map-style browsing depend on the search experience configured for the site." },
      { title: "A local inventory", body: "Search covers the listings that workspace is set up to show. HouzzatPRO does not claim nationwide or multi-board coverage." },
      { title: "Client activity", body: "Property interest can be visible on the lead when that activity is captured." },
    ],
    note: "MLS® is a trademark of the Canadian Real Estate Association. Coverage is limited to the data that workspace is authorized to display.",
  },
  {
    path: "/product/lead-capture",
    title: "Lead Capture | HouzzatPRO",
    description:
      "How a HouzzatPRO website visitor can become a lead that an agent is notified to follow up.",
    kicker: "Lead capture",
    headline: "From visitor to a lead someone owns.",
    lead: "The path is short when the workspace has capture turned on: a visitor acts, a lead is created, and follow-up starts from that record.",
    kind: "flow",
    shots: [siteDesk],
    steps: [
      { title: "Visitor", body: "Someone arrives on the branded website." },
      { title: "Property search", body: "They look at homes." },
      { title: "Action", body: "A registration or other capture action the site provides creates the opportunity." },
      { title: "Lead created", body: "HouzzatPRO opens a lead record." },
      { title: "Agent notified", body: "The assigned agent can see the new lead and start the conversation." },
    ],
  },
  {
    path: "/product/alerts",
    title: "Alerts & Follow-up | HouzzatPRO",
    description:
      "How HouzzatPRO keeps lead follow-up and client property interest visible, and what is not an automated promise.",
    kicker: "Follow-up",
    headline: "The moments that should not be forgotten.",
    lead: "HouzzatPRO is built so a new lead, property interest, and a viewing request stay on the client record. Some notifications depend on what that workspace has enabled.",
    kind: "flow",
    steps: [
      { title: "New lead", body: "A new lead appears for the assigned agent." },
      { title: "Property interest", body: "Homes a client engages with can stay visible with that lead." },
      { title: "Viewing requested", body: "A requested showing can be organized in the viewing planner." },
      { title: "Follow-up", body: "The next conversation starts from the existing record, not a blank page." },
    ],
    note: "Listing alerts such as a new listing or a price change are part of the product direction shown in marketing. They are not a promise that every workspace sends those messages automatically.",
  },
  {
    path: "/product/properties",
    title: "Properties & Viewings | HouzzatPRO",
    description:
      "Search properties in HouzzatPRO, choose what to show, plan the route, and follow up afterward.",
    kicker: "Showings",
    headline: "Search, plan, show, then follow up.",
    lead: "Property search and the viewing planner are two parts of the same client work: choose homes, put them in order, and keep the result on the lead.",
    kind: "split",
    shots: [properties, planner, route],
    steps: [
      { title: "Search", body: "Find homes in the workspace’s search." },
      { title: "Select", body: "Keep the homes that belong on the client’s tour." },
      { title: "Plan", body: "Arrange them into a viewing day." },
      { title: "View", body: "Take the plan on the phone." },
      { title: "Follow up", body: "Come back to the same lead afterward." },
    ],
  },
  {
    path: "/product/viewing-planner",
    title: "Viewing Planner | HouzzatPRO",
    description:
      "Plan a HouzzatPRO viewing day with selected properties, order, distance, and driving time. Sample figures are illustrative.",
    kicker: "Viewing planner",
    headline: "A viewing day, already in order.",
    lead: "Select the homes, see them as a route, and take the plan on HouzzatPRO Mobile. The marketing sample shows 5 viewings, 20.0 km, and 1 hr 10 min of driving. Those figures are an example, not a customer statistic.",
    kind: "split",
    shots: [planner, route],
    points: [
      { title: "Selected properties", body: "The tour is a set of homes, not a loose list of tabs." },
      { title: "Schedule", body: "The day has an order you can work from." },
      { title: "Route", body: "Distance and driving time describe the sample day. They are not a measured result from a customer’s business." },
      { title: "On the phone", body: "The same plan is there when you leave the office." },
    ],
  },
  {
    path: "/product/mobile",
    title: "HouzzatPRO Mobile | HouzzatPRO",
    description:
      "Use HouzzatPRO Mobile for lead profiles, activity, properties, and the viewing planner away from the desk.",
    kicker: "Mobile",
    headline: "Your real estate business, wherever you are.",
    lead: "HouzzatPRO Mobile carries the lead profile, activity, and the viewing plan. It is the same system, not a separate app with a different client list.",
    kind: "phones",
    shots: [profile, launchMobile, planner],
    points: [
      { title: "Lead profile", body: "Open the client, including the fictional marketing profile for Emily Carter." },
      { title: "Activity", body: "See what already happened before you call." },
      { title: "Viewing planner", body: "Run the viewing day from the phone." },
    ],
  },
  {
    path: "/solutions/agents",
    title: "For Individual Agents | HouzzatPRO",
    description:
      "HouzzatPRO for an individual agent: one system for the website, leads, showings, and mobile follow-up.",
    kicker: "Individual agents",
    headline: "Your brand and your book of business, together.",
    lead: "Build the site, capture the lead, work the relationship, show the homes, and keep the follow-up. HouzzatPRO is one operating system for that work.",
    kind: "audience",
    shots: [launchDesk],
    steps: [
      { title: "Build your brand", body: "The consumer website presents you." },
      { title: "Generate leads", body: "Site activity can become a lead." },
      { title: "Manage relationships", body: "The CRM holds the record." },
      { title: "Show properties", body: "Search and the viewing planner sit beside the lead." },
      { title: "Stay engaged", body: "Mobile keeps the same record with you." },
    ],
  },
  {
    path: "/solutions/teams",
    title: "For Real Estate Teams | HouzzatPRO",
    description:
      "HouzzatPRO for a team that needs shared lead records, assignment, and one client experience.",
    kicker: "Teams",
    headline: "A team can work the same client.",
    lead: "Routing can place a new lead with an agent. The record, conversation, and activity stay shared so the next person is not starting over.",
    kind: "audience",
    shots: [crm],
    points: [
      { title: "Assignment", body: "A lead can be assigned to an agent." },
      { title: "One record", body: "Notes and activity are on the lead, not in a private notebook." },
      { title: "Visibility", body: "What the workspace allows the team to see is the lead record itself." },
    ],
    note: "Team administration is limited to the workspace tools that exist today. This page does not add an enterprise admin console.",
  },
  {
    path: "/solutions/brokerages",
    title: "For Brokerages | HouzzatPRO",
    description:
      "HouzzatPRO for a brokerage that wants its agents and client websites connected through the same lead system.",
    kicker: "Brokerages",
    headline: "A branded system your agents can share.",
    lead: "A brokerage can present a branded website and give agents a connected place to work leads. HouzzatPRO does not claim a separate enterprise suite beyond the platform that exists.",
    kind: "audience",
    shots: [siteDesk, launchDesk],
    points: [
      { title: "One client journey", body: "The public site and the agent’s lead record are the same product family." },
      { title: "Agents", body: "Leads can be assigned so follow-up has an owner." },
      { title: "The same tools", body: "Website, CRM, search, viewings, and mobile are the platform. They are not sold here as unnamed extra products." },
    ],
  },
  {
    path: "/solutions/generate-leads",
    title: "Generate More Leads | HouzzatPRO",
    description: "Use the HouzzatPRO website, property search, and lead capture together.",
    kicker: "By goal",
    headline: "Generate more leads from the site you already run.",
    lead: "The website, property search, and lead capture are the front of HouzzatPRO. They are how a visitor becomes someone you can follow up with.",
    kind: "goal",
    links: [
      { href: "/product/website", title: "Website", body: "The branded consumer experience." },
      { href: "/product/mls-search", title: "Property search", body: "Listings the workspace can show." },
      { href: "/product/lead-capture", title: "Lead capture", body: "The step that opens a lead record." },
    ],
  },
  {
    path: "/solutions/convert-leads",
    title: "Convert More Leads | HouzzatPRO",
    description: "Work HouzzatPRO leads through the CRM, conversations, and follow-up.",
    kicker: "By goal",
    headline: "Convert more leads after they have a record.",
    lead: "Once a lead exists, the CRM, the conversation, and the follow-up on that record are how the relationship continues.",
    kind: "goal",
    links: [
      { href: "/product/crm", title: "CRM", body: "The lead list, profile, and activity." },
      { href: "/product/conversations", title: "Conversations", body: "History that stays with the client." },
      { href: "/product/alerts", title: "Follow-up", body: "What is available, and what is not promised." },
    ],
  },
  {
    path: "/solutions/client-experience",
    title: "Improve Client Experience | HouzzatPRO",
    description: "Property search, communication, and the viewing planner in HouzzatPRO.",
    kicker: "By goal",
    headline: "A clearer experience for the client.",
    lead: "Clients can search homes, stay in a conversation that remains on their record, and walk a viewing day that was planned in advance.",
    kind: "goal",
    links: [
      { href: "/product/mls-search", title: "Property discovery", body: "Search the homes that workspace shows." },
      { href: "/product/conversations", title: "Communication", body: "History on the lead record." },
      { href: "/product/viewing-planner", title: "Viewing planner", body: "A day with an order and a route." },
    ],
  },
  {
    path: "/solutions/work-from-anywhere",
    title: "Work From Anywhere | HouzzatPRO",
    description: "Run HouzzatPRO lead and viewing work from the mobile app.",
    kicker: "By goal",
    headline: "Work from the phone you already carry.",
    lead: "HouzzatPRO Mobile includes the lead profile, activity, and the viewing planner so the desk is not the only place the record exists.",
    kind: "goal",
    shots: [profile, planner],
    links: [
      { href: "/product/mobile", title: "HouzzatPRO Mobile", body: "The app product page." },
    ],
  },
  {
    path: "/pricing",
    title: "Pricing | HouzzatPRO",
    description:
      "HouzzatPRO plans are tailored to your real estate business through a private proposal. Book a demo to request pricing.",
    kicker: "Pricing",
    headline: "A proposal for your business, not a public price card.",
    lead: "HouzzatPRO does not publish dollar amounts or self-serve checkout. After a demo, the team prepares a private proposal for your setup.",
    kind: "pricing",
    points: [
      { title: "Private proposal", body: "Pricing follows a personalized demo. There is no public self-serve checkout." },
      { title: "Sized to the practice", body: "The proposal can reflect an individual agent or a growing team." },
      { title: "What it considers", body: "Setup, seats, and the capabilities you will actually use." },
    ],
    note: "No public price is shown because no definitive public price is configured. Commercial terms stay with the private proposal.",
    groups: [
      {
        heading: "Pricing",
        items: [
          {
            q: "Where is the price?",
            a: "There is no public price. HouzzatPRO prepares a private proposal after a demo.",
          },
          {
            q: "Is there a free trial or self-serve signup?",
            a: "No. Getting started goes through a demo and a proposal.",
          },
          {
            q: "What happens next?",
            a: "Book a demo, walk through the platform, and the team follows up with a proposal for your operation.",
          },
        ],
      },
    ],
  },
  {
    path: "/resources",
    title: "Resources | HouzzatPRO",
    description: "The HouzzatPRO resource hub. Guides will be published here when they exist.",
    kicker: "Resources",
    headline: "Guides for the work HouzzatPRO supports.",
    lead: "This hub is the home for future guides. There are no published articles yet, so nothing here is presented as a library.",
    kind: "hub",
    points: [
      { title: "Lead generation", body: "Website, search, and capture." },
      { title: "CRM and follow-up", body: "Records, conversations, and next steps." },
      { title: "Real estate websites", body: "The branded consumer site." },
      { title: "Client experience", body: "Search, communication, and viewings." },
      { title: "Business growth", body: "How an agent, team, or brokerage uses one system." },
      { title: "HouzzatPRO guides", body: "Product guides will be listed here when they are written." },
    ],
  },
  {
    path: "/blog",
    title: "Blog | HouzzatPRO",
    description: "The HouzzatPRO blog. No articles are published yet.",
    kicker: "Blog",
    headline: "Writing about the work, when there is something to publish.",
    lead: "The blog is ready as a place for real articles. None are published yet, and this page does not invent any.",
    kind: "hub",
  },
  {
    path: "/product-updates",
    title: "Product Updates | HouzzatPRO",
    description: "HouzzatPRO product updates. No public changelog is published yet.",
    kicker: "Product updates",
    headline: "What changes in HouzzatPRO.",
    lead: "Release notes will be posted here from an authoritative source. There is no public changelog to show yet.",
    kind: "hub",
  },
  {
    path: "/customer-stories",
    title: "Customer Stories | HouzzatPRO",
    description: "HouzzatPRO customer stories. None are published until a professional agrees to share one.",
    kicker: "Customer stories",
    headline: "Stories only when they are real.",
    lead: "This page is the finished frame for customer stories. It is empty on purpose. HouzzatPRO does not publish invented testimonials, companies, or performance numbers.",
    kind: "hub",
  },
  {
    path: "/faq",
    title: "FAQ | HouzzatPRO",
    description: "Answers about the HouzzatPRO platform, website, CRM, property search, mobile app, and pricing.",
    kicker: "FAQ",
    headline: "Questions about HouzzatPRO.",
    lead: "Answers below are limited to how the product is described today.",
    kind: "faq",
    groups: [
      {
        heading: "Platform",
        items: [
          { q: "What is HouzzatPRO?", a: "It is the operating system for a real estate website, property search, leads, viewings, and mobile follow-up." },
          { q: "Where do I sign in?", a: "Existing customers sign in at app.houzzatpro.com." },
        ],
      },
      {
        heading: "Website and CRM",
        items: [
          { q: "Is the consumer website separate?", a: "It is the public front of HouzzatPRO. Activity that the workspace captures can become a CRM lead." },
          { q: "What does the CRM hold?", a: "Lead organization, profiles, notes, status, assignment, activity, and conversation history." },
        ],
      },
      {
        heading: "Property search",
        items: [
          { q: "Which listings can people search?", a: "The listings that workspace is set up to display. HouzzatPRO does not claim nationwide or multi-board coverage." },
        ],
      },
      {
        heading: "Mobile",
        items: [
          { q: "What is on mobile?", a: "Lead profiles, activity, and the viewing planner are part of HouzzatPRO Mobile." },
        ],
      },
      {
        heading: "Pricing",
        items: [
          { q: "How much does it cost?", a: "There is no public price. Plans are a private proposal after a demo." },
        ],
      },
      {
        heading: "Getting started",
        items: [
          { q: "How do I begin?", a: "Book a demo. Support for existing customers is at support@houzzatpro.com." },
        ],
      },
    ],
  },
  {
    path: "/contact",
    title: "Contact | HouzzatPRO",
    description: "Contact HouzzatPRO for a demo, a product question, or existing-customer support.",
    kicker: "Contact",
    headline: "Talk to the right part of the team.",
    lead: "Sales conversations start with a demo. Existing customers use technical support. This page does not open a second contact system.",
    kind: "contact",
    links: [
      { href: "/book-a-demo", title: "Sales", body: "Book a demo to see the platform and request a proposal." },
      { href: "/book-a-demo", title: "Product questions", body: "A demo is the conversation for how the product fits your business." },
      { href: "/support", title: "Existing customer support", body: "Technical support for platform access and account issues." },
    ],
  },
];

const storyByPath = new Map(PUBLIC_STORIES.map((story) => [story.path, story]));

export function publicStory(path: OwnedChromePath): PublicStory {
  const story = storyByPath.get(path);
  if (!story) {
    throw new Error(`Missing HouzzatPRO public story for ${path}`);
  }
  return story;
}
