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
  caslConsentAt?: string | null;
  emailAlertsEnabled?: boolean;
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

export type AgentTaskType = "CALL" | "EMAIL" | "TODO";
export type AgentTaskStatus = "OPEN" | "DONE" | "CANCELLED";

/** Stage 4.6 — compact AgentTask DTO for Lead Detail Task & Reminders. */
export interface MobileLeadTask {
  id: string;
  type: AgentTaskType;
  status: AgentTaskStatus;
  title: string;
  body: string | null;
  dueAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeadTasksResponseData {
  tasks: MobileLeadTask[];
}

export type AppointmentType =
  | "SHOWING"
  | "VIRTUAL_VIEWING"
  | "BUYER_SESSION"
  | "VALUATION_CALL";

export type AppointmentStatus =
  | "REQUESTED"
  | "CONFIRMED"
  | "RESCHEDULED"
  | "COMPLETED"
  | "CANCELLED";

/** Stage 4.7 — compact Appointment DTO for Lead Detail Appointments tab. */
export interface MobileLeadAppointment {
  id: string;
  type: AppointmentType;
  status: AppointmentStatus;
  startsAt: string | null;
  endsAt: string | null;
  listingMls: string | null;
  notes: string | null;
  videoJoinUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeadAppointmentsResponseData {
  appointments: MobileLeadAppointment[];
}

/** Stage 4.8 — LeadEmailLog DTO (web Conversations tab = CRM emails). */
export interface MobileLeadEmail {
  id: string;
  subject: string;
  body: string;
  toEmail: string;
  kind: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  openCount: number;
  clickCount: number;
  lastClickedUrl: string | null;
  createdAt: string;
  /** Populated on preview fetch — full client HTML template. */
  htmlBody?: string | null;
  customerName?: string | null;
  sentByName?: string | null;
}

export interface LeadConversationsResponseData {
  emails: MobileLeadEmail[];
  nextCursor?: string | null;
  hasMore?: boolean;
  composer?: {
    toEmail: string | null;
    consented: boolean;
    alertsEnabled: boolean;
  };
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
    emails?: number;
  };
  /** Stage 4.8 — LeadEmailLog rows (web Conversations tab parity). */
  emails?: MobileLeadEmail[];
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
