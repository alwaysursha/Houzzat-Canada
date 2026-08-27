/**
 * Stage 3K.5.6 — inventory of public lead-producing write paths (documentation + tests).
 */
export type PublicLeadWritePath = {
  id: string;
  route: string;
  method: string;
  creates: ("Lead" | "Contact" | "User")[];
  usesRequestTenancy: boolean;
  legacyBehavior: string;
  workspaceBehavior: string;
  sideEffects: string[];
};

/** Static inventory — keep in sync with API routes and lead-intake. */
export const PUBLIC_LEAD_WRITE_PATHS: PublicLeadWritePath[] = [
  {
    id: "listing-inquiry",
    route: "/api/leads",
    method: "POST",
    creates: ["Lead"],
    usesRequestTenancy: true,
    legacyBehavior: "Houzzat default workspace + brokerage org via resolveDefaultWorkspaceIdForRouting",
    workspaceBehavior: "resolvePublicLeadWorkspaceIdFromRequest(request) → workspaceId on Lead",
    sideEffects: [
      "notifyNewLeadCapturedToStaff",
      "scheduleNewLeadStaffEmail",
      "createCallNewLeadTask",
      "LeadActivity",
      "Appointment (showing kinds)",
    ],
  },
  {
    id: "home-valuation",
    route: "/api/valuation",
    method: "POST",
    creates: ["Lead", "User"],
    usesRequestTenancy: true,
    legacyBehavior: "Houzzat desk routing + optional account create",
    workspaceBehavior: "Hostname-scoped workspaceId on Lead",
    sideEffects: [
      "notifyNewLeadCapturedToStaff",
      "scheduleNewLeadStaffEmail",
      "createCallNewLeadTask",
      "ValuationRequest",
      "User upsert (ensureOwnerCustomer)",
    ],
  },
  {
    id: "signup",
    route: "/api/auth/sign-up",
    method: "POST",
    creates: ["User", "Lead"],
    usesRequestTenancy: true,
    legacyBehavior: "Houzzat default routing when TENANT_PUBLIC_LEAD_SCOPE=legacy",
    workspaceBehavior: "captureWebsiteLead({ request }) → hostname workspace routing",
    sideEffects: [
      "captureWebsiteLead",
      "notifyNewLeadCaptured",
      "scheduleNewLeadStaffEmail",
      "email verification",
    ],
  },
  {
    id: "affordability-tool",
    route: "/api/tools/affordability-lead",
    method: "POST",
    creates: ["Lead"],
    usesRequestTenancy: true,
    legacyBehavior: "Houzzat buyer desk",
    workspaceBehavior: "Hostname workspace routing",
    sideEffects: ["Lead create", "staff notifications"],
  },
  {
    id: "seller-readiness",
    route: "/api/tools/seller-readiness",
    method: "POST",
    creates: ["Lead"],
    usesRequestTenancy: true,
    legacyBehavior: "Houzzat seller desk",
    workspaceBehavior: "Hostname workspace routing",
    sideEffects: ["Lead create", "staff notifications"],
  },
  {
    id: "route-planner-request",
    route: "/api/route-planner/request",
    method: "POST",
    creates: ["Lead"],
    usesRequestTenancy: true,
    legacyBehavior: "Houzzat routing",
    workspaceBehavior: "Hostname workspace routing",
    sideEffects: ["Lead create", "RoutePlannerRequest", "notifications"],
  },
  {
    id: "pre-construction-inquiry",
    route: "/api/pre-construction/inquiry",
    method: "POST",
    creates: ["Lead"],
    usesRequestTenancy: true,
    legacyBehavior: "Houzzat buyer desk",
    workspaceBehavior: "Hostname workspace routing",
    sideEffects: ["Lead create"],
  },
];

export const PUBLIC_LEAD_CUTOVER_BLOCKERS = [
  "TENANT_PUBLIC_LEAD_SCOPE remains legacy until explicit cutover (see docs/tenant-canary/lead-cutover-flag-plan.md)",
  "Tenant B production routing config must be verified (ACTIVE members + CrmRoutingSettings) before flip",
  "Manual credentials auth smoke on tenant-canary.houzzatpro.com",
  "Controlled canary lead apply optional — workspace:lead-canary with explicit confirmation",
  "Production houzzat Worker cutover is a separate stage from tenant-canary flag flip",
  "Google OAuth not configured for tenant hosts",
] as const;
