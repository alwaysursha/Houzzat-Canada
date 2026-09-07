/**
 * Stage 6.11E.2 — Team Signature DEMO identity for template preview only.
 * NEVER use these values for a live selected tenant website.
 * Placeholder roster is presentation-only — not a data model.
 */
export const TEAM_SIGNATURE_DEMO = {
  teamName: "Northline Realty Team",
  tagline: "Premium representation across the markets that matter.",
  serviceArea: "Greater Toronto Area",
  logoUrl: null as string | null,
  phone: "(416) 555-0200",
  email: "hello@northline.example.com",
  brokerageName: "Premier Realty Group",
  brokerageAddress: "100 King Street West\nToronto, ON M5X 1A9",
  brokeragePhone: "(416) 555-0100",
  brokerageFax: "(416) 555-0199",
  brokerageLogoUrl: null as string | null,
  markets: ["Toronto", "Mississauga", "Oakville", "Vaughan", "Markham"],
  members: [
    {
      id: "demo-1",
      name: "Jordan Hale",
      designation: "Team Lead · REALTOR®",
      isLeader: true,
      cellPhone: "(416) 555-0201",
      email: "jordan@northline.example.com",
      photoUrl: null as string | null,
      bio: "Sample preview biography — not a live team member.",
    },
    {
      id: "demo-2",
      name: "Sam Rivera",
      designation: "REALTOR®",
      isLeader: false,
      cellPhone: "(416) 555-0202",
      email: "sam@northline.example.com",
      photoUrl: null as string | null,
      bio: null as string | null,
    },
    {
      id: "demo-3",
      name: "Casey Nguyen",
      designation: "REALTOR®",
      isLeader: false,
      cellPhone: null as string | null,
      email: "casey@northline.example.com",
      photoUrl: null as string | null,
      bio: null as string | null,
    },
    {
      id: "demo-4",
      name: "Morgan Ellis",
      designation: "Buyer Specialist",
      isLeader: false,
      cellPhone: "(416) 555-0204",
      email: null as string | null,
      photoUrl: null as string | null,
      bio: null as string | null,
    },
  ],
  testimonials: [
    {
      quote:
        "The team was coordinated, prepared, and always a step ahead of the market.",
      attribution: "Sample Client · Toronto",
    },
    {
      quote:
        "We felt like we had a full desk behind us — not just one agent.",
      attribution: "Sample Client · Oakville",
    },
  ],
} as const;

export type TeamSignatureDemo = typeof TEAM_SIGNATURE_DEMO;
