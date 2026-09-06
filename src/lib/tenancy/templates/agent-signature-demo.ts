/**
 * Stage 6.11B.2 — Agent Signature DEMO identity for OWNER template preview only.
 * NEVER use these values for a live selected tenant website.
 */
export const AGENT_SIGNATURE_DEMO = {
  name: "Alex Morgan",
  firstName: "Alex",
  title: "REALTOR®",
  tagline: "Helping You Move With Confidence",
  serviceArea: "Greater Toronto Area",
  brokerageName: "Premier Realty Group",
  brokerageAddress: "100 King Street West\nToronto, ON M5X 1A9",
  brokeragePhone: "(416) 555-0100",
  brokerageFax: "(416) 555-0199",
  brokerageLogoUrl: null,
  phone: "(416) 555-0142",
  email: "alex.morgan@example.com",
  /** Local demo-safe mock portrait — preview only; not scraped from any third-party site. */
  photoUrl: "/images/agent-signature-demo-portrait.jpg",
  bio: [
    "Alex Morgan is a Greater Toronto Area REALTOR® focused on clear guidance,",
    "strong preparation, and a calm, professional process — whether you are buying",
    "your next home or preparing to sell.",
    "",
    "This biography is sample template-preview content only.",
  ].join(" "),
  markets: ["Toronto", "Mississauga", "Oakville", "Vaughan", "Markham"],
  metrics: [
    { value: "10+", label: "Years Real Estate Experience" },
    { value: "500+", label: "Homes Sold" },
    { value: "TOP", label: "Producer Recognition" },
    { value: "GTA", label: "Market Expertise" },
  ],
  testimonials: [
    {
      quote:
        "Alex made every step feel clear and confident. We always knew the next move.",
      attribution: "Sample Client · Toronto",
    },
    {
      quote:
        "Professional, prepared, and genuinely invested in the outcome we wanted.",
      attribution: "Sample Client · Oakville",
    },
  ],
} as const;

export type AgentSignatureDemo = typeof AGENT_SIGNATURE_DEMO;
