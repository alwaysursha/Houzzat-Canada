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
  /** Most recent consumer site presence / activity (hotness lastSeen). */
  lastSeenAt?: string | null;
  isOnline?: boolean;
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
  /** Canonical LeadNote id when this activity is a note (from activity.meta.noteId). */
  noteId?: string;
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

/** Stage 5.0 — Global Tasks list item (web /agent/tasks + Instant Shell). */
export interface MobileGlobalTask extends MobileLeadTask {
  leadId: string | null;
  lead: {
    id: string;
    customer: { name: string | null; email: string | null };
  } | null;
}

export interface LeadTasksResponseData {
  tasks: MobileLeadTask[];
}

export interface GlobalTasksResponseData {
  tasks: MobileGlobalTask[];
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

/** Stage 5.1 — Global Calendar list item (web /agent/appointments). */
export interface MobileGlobalAppointment extends MobileLeadAppointment {
  leadId: string | null;
  customer: {
    name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  lead: {
    id: string;
    customer: { name: string | null; email: string | null };
  } | null;
}

export interface LeadAppointmentsResponseData {
  appointments: MobileLeadAppointment[];
}

export interface GlobalAppointmentsResponseData {
  from: string;
  to: string;
  appointments: MobileGlobalAppointment[];
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

/**
 * Stage 5.8 — Global Communications inbox row (LeadEmailLog, outbound-only).
 * Same canonical record as Lead Profile → Conversations.
 */
export interface MobileCommunicationItem {
  id: string;
  channel: "email";
  direction: "outbound";
  subject: string;
  snippet: string;
  toEmail: string;
  kind: string;
  openedAt: string | null;
  openCount: number;
  clickedAt: string | null;
  clickCount: number;
  lastClickedUrl: string | null;
  createdAt: string;
  leadId: string;
  customerName: string | null;
  customerEmail: string | null;
  sentByName: string | null;
}

export interface MobileCommunicationDetail extends Omit<
  MobileCommunicationItem,
  "snippet"
> {
  body: string;
  htmlBody?: string | null;
  mlsNumber?: string | null;
}

export interface CommunicationsListResponseData {
  communications: MobileCommunicationItem[];
  nextCursor: string | null;
  hasMore: boolean;
  meta: {
    mode: "outbound_email_activity";
    inboundEmailCanonical: false;
    channels: readonly ["email"];
  };
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

/** Stage 4.9 — Lead engagement DTO (web CustomerProfile Engagement tab parity). */
export interface MobileLeadEngagementMatch {
  mlsNumber: string;
  address: string;
  listPrice: number | null;
  bedsLabel: string | null;
  imageUrl: string | null;
  primaryImageUrl: string | null;
  beds: number;
  baths: number;
  transactionType: "SALE" | "LEASE";
  status: string;
  propertyType: string;
  addressLine: string;
  unitNumber: string | null;
  city: string;
  community: string | null;
  listedAt: string;
  soldAt: string | null;
  daysOnMarket: number;
  timingLabel: string;
}

export interface MobileLeadEngagement {
  hot: {
    hotness: number;
    views24h: number;
    distinctListings24h: number;
    isOnline: boolean;
    binge: boolean;
    lastSeenAt: string | null;
  };
  stats: {
    saves: number;
    alerts: number;
    emails: number;
    savedSearchCount: number;
  };
  lastTouchAt: string;
  rings: {
    emailOpens: number;
    emailClicks: number;
    alertOpens: number;
  };
  buyerIntent: {
    summary: string;
    chips: string[];
    source: string;
    sourceLabel: string;
    headline: string | null;
  };
  savedSearches: Array<{
    id: string;
    name: string;
    emailAlerts: boolean;
    smsAlerts: boolean;
    isHomepageActive: boolean;
    query: unknown;
  }>;
  savedListings: Array<{ id: string; mlsNumber: string }>;
  propertyMonitors: Array<{ id: string; mlsNumber: string }>;
  areaMonitors: Array<{ id: string; name: string; city: string }>;
  listingNotes: Array<{ id: string; mlsNumber: string; body: string }>;
  tours: Array<{
    id: string;
    name: string;
    status: string;
    stops: Array<{ mlsNumber: string }>;
  }>;
  alerts: Array<{ id: string; title: string; kind: string }>;
  matches: MobileLeadEngagementMatch[];
  matchesLoaded: boolean;
}

export interface LeadEngagementResponseData {
  engagement: MobileLeadEngagement;
}

export interface LeadDetailResponseData {
  lead: MobileLeadDetail;
}
