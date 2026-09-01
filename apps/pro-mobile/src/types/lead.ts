/**
 * Stage 4.3A & 4.4 — HouzzatPRO Mobile v2 Lead Domain Models.
 * Reuses canonical Prisma enum values and schemas.
 */

export type LeadStatus =
  | "NEW_LEAD"
  | "ATTEMPTED_CONTACT"
  | "CONTACTED"
  | "APPT_SET"
  | "APPT_MET"
  | "ACTIVE_CLIENT"
  | "PENDING_CLIENT"
  | "PAST_CLIENT";

export type LeadSource =
  | "PROPERTY_INQUIRY"
  | "SHOWING_REQUEST"
  | "VIRTUAL_VIEWING"
  | "HOME_VALUATION"
  | "BUYER_SESSION"
  | "SAVED_SEARCH"
  | "LANDING_PAGE"
  | "OPEN_HOUSE"
  | "PAID_AD"
  | "AFFORDABILITY"
  | "SELLER_READINESS"
  | "SIGNUP"
  | "OTHER";

export type LeadIntent = "BUYER" | "SELLER";

export interface MobileLeadCustomer {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  isBuyer?: boolean;
  isSeller?: boolean;
  purchaseTimeframe?: string | null;
  homeAddress?: string | null;
  createdAt?: string;
}

export interface MobileLeadAssignedAgent {
  id: string;
  name: string | null;
  email: string | null;
}

export interface MobileLeadSummary {
  id: string;
  status: LeadStatus;
  source: LeadSource;
  intent: LeadIntent;
  score: number;
  createdAt: string;
  updatedAt: string;
  statusChangedAt: string;
  customer: MobileLeadCustomer | null;
  assignedAgent: MobileLeadAssignedAgent | null;
}

export interface MobileLeadActivity {
  id: string;
  type: string;
  body: string | null;
  createdAt: string;
  /** Present when activity is a pinned LeadNote (canonical LeadNote.pinned). */
  pinned?: boolean;
}

export interface MobileLeadDetail {
  id: string;
  status: LeadStatus;
  source: LeadSource;
  intent: LeadIntent;
  score: number;
  inquiryTag: string | null;
  notes: string | null;
  listingMls: string | null;
  firstRespondedAt: string | null;
  statusChangedAt: string;
  contactConsentAt: string | null;
  lostReason: string | null;
  winReason: string | null;
  utmSource: string | null;
  utmCampaign: string | null;
  createdAt: string;
  updatedAt: string;
  customer: MobileLeadCustomer | null;
  assignedAgent: MobileLeadAssignedAgent | null;
  isPond: boolean;
  recentActivities: MobileLeadActivity[];
  counts: {
    notes: number;
    appointments: number;
    tasks: number;
  };
}

export interface LeadsPagination {
  page: number;
  limit: number;
  totalCount: number;
  hasMore: boolean;
}

export interface LeadsResponseData {
  leads: MobileLeadSummary[];
  pagination: LeadsPagination;
}

export interface LeadDetailResponseData {
  lead: MobileLeadDetail;
}
