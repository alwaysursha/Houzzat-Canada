/**
 * Stage 5.6 — Mobile Viewings Planner DTO (mirrors serializeProViewingsPlannerPayload).
 */

export type MobileViewingsPlannerStopListing = {
  mlsNumber: string;
  addressLine: string;
  unitNumber: string | null;
  city: string;
  listPrice: number;
  status: string;
  primaryImageUrl: string | null;
  beds: number;
  bedsLabel: string | null;
  baths: number;
  lat: number | null;
  lng: number | null;
};

export type MobileViewingsPlannerStop = {
  id: string;
  mlsNumber: string;
  sortOrder: number;
  locked: boolean;
  dwellMinutes: number;
  driveFromPrevSeconds: number | null;
  driveFromPrevMeters: number | null;
  suggestedArriveAt: string | null;
  suggestedLeaveAt: string | null;
  appointmentId: string | null;
  listing: MobileViewingsPlannerStopListing | null;
};

export type MobileViewingsPlannerBrand = {
  workspaceId: string;
  tier: string;
  displayName: string;
  tagline: string;
  logoUrl: string | null;
  brokerageLogoUrl: string | null;
  faviconUrl: string | null;
  ogImageUrl: string | null;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    surface: string;
    ink: string;
  };
  contact: {
    email: string | null;
    phone: string | null;
  };
  footerLegalText: string | null;
  poweredByHouzzatPro: boolean;
  seoDescription: string;
  version: number;
};

export type MobileViewingsPlannerAgent = {
  name: string | null;
  email: string | null;
  phone: string | null;
};

export type MobileViewingsPlannerSummary = {
  stopCount: number;
  totalMeters: number;
  totalDriveSeconds: number;
};

export type MobileViewingsPlannerTour = {
  id: string;
  name: string;
  status: string;
  startAddress: string | null;
  startLat: number | null;
  startLng: number | null;
  startAt: string | null;
  defaultDwellMinutes: number;
  bufferMinutes: number;
  shareToken: string | null;
  requestedAt: string | null;
  stopCount: number;
  leadId: string;
  agentId: string;
  workspaceId: string;
  viewingDate: string | null;
  summary: MobileViewingsPlannerSummary;
  stops: MobileViewingsPlannerStop[];
  brand: MobileViewingsPlannerBrand | null;
  agent: MobileViewingsPlannerAgent | null;
  sharePath: string | null;
};

export type ViewingShareChannel =
  | "email"
  | "whatsapp"
  | "sms"
  | "copy_link"
  | "native_share";
