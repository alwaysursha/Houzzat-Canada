/**
 * Lead Profile V2 DTOs. Independent of Legacy LeadSummary / LeadProfileSnapshot.
 */
import type {
  CustomerAlertKind,
  InquiryTag,
  LeadStatus,
  ViewingTourStatus,
} from "@prisma/client";

export type LeadProfileV2ResourceKey =
  | "shell"
  | "timeline"
  | "tasks"
  | "appointments"
  | "emails"
  | "conversation-chat"
  | "engagement-overview"
  | "saved-searches"
  | "saved-homes"
  | "property-watches"
  | "area-monitors"
  | "route-planner"
  | "listing-notes"
  | "alerts"
  | "rail"
  | "looking-for"
  | "next-reminder";

export type LeadProfileV2Task = {
  id: string;
  type: string;
  status: string;
  title: string;
  dueAt: string;
};

export type LeadProfileV2FollowUpNote = {
  id: string;
  body: string;
  category: "GENERAL" | "CALL";
  pinned: boolean;
  createdAt: string;
  author: { name: string | null; email: string };
};

export type LeadProfileV2TasksPanel = {
  tasks: LeadProfileV2Task[];
  notes: LeadProfileV2FollowUpNote[];
};

/** Same visible snapshot fields as the current rail Next reminder card. */
export type LeadProfileV2NextReminder = {
  title: string;
  dueAt: string;
};

export type LeadProfileV2NextReminderPanel = {
  nextReminder: LeadProfileV2NextReminder | null;
};

export type LeadProfileV2Appointment = {
  id: string;
  type: string;
  status: string;
  startsAt: string | null;
  listingMls: string | null;
  videoJoinUrl: string | null;
  notes: string | null;
};

export type LeadProfileV2AppointmentsPanel = {
  appointments: LeadProfileV2Appointment[];
};

export type LeadProfileV2Email = {
  id: string;
  subject: string;
  toEmail: string;
  kind: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  openCount: number;
  clickCount: number;
  createdAt: string;
};

export type LeadProfileV2EmailsPanel = {
  emails: LeadProfileV2Email[];
  hasMore: boolean;
};

export type LeadProfileV2ChatMessage = {
  id: string;
  channel: string;
  kind: string;
  senderKind: string;
  senderUserId: string | null;
  senderName: string;
  body: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  replyToMessageId: string | null;
  createdAt: string;
  deliveredAt: string | null;
  smsSource: string | null;
  providerStatus: string | null;
  payload: unknown;
};

export type LeadProfileV2ChatUnread = {
  count: number;
  dividerMessageId: string | null;
  cutoffMode: string;
  agentCursorValid: boolean;
};

export type LeadProfileV2ChatPanel = {
  conversation: {
    id: string;
    leadId: string;
    status: string;
    createdAt: string;
    lastMessageAt: string | null;
    created: boolean;
  };
  assignedAgentId: string | null;
  viewer: {
    userId: string;
    isAssignedAgent: boolean;
    canMarkRead: boolean;
  };
  unread: LeadProfileV2ChatUnread;
  messages: LeadProfileV2ChatMessage[];
  smsSend?: {
    enabled: boolean;
    reason: string | null;
  };
  smsQuickTexts?: Array<{
    id: string;
    key: string;
    name: string;
    category: string;
    body: string;
    rendered: string;
  }>;
  page: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
};

export type LeadProfileV2BuyerIntentCriteria = {
  cities: string[];
  communities: string[];
  propertyTypes: string[];
  minBeds: number | null;
  maxBeds: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  transactionType: "SALE" | "LEASE" | null;
  searchCount: number;
  listingViewCount: number;
  sampleMls: string[];
};

/** Same visible BuyerIntentSnapshot fields Matchboard consumes. */
export type LeadProfileV2BuyerIntent = {
  summary: string;
  chips: string[];
  source: "saved" | "inferred" | "mixed" | "thin";
  sourceLabel: string;
  criteria: LeadProfileV2BuyerIntentCriteria;
  headline: string | null;
};

/** First-paint Looking For plus Info Search label from the same primary row. */
export type LeadProfileV2LookingForPanel = LeadProfileV2BuyerIntent & {
  savedSearchLabel: string | null;
};

export type LeadProfileV2MatchboardSearch = {
  id: string;
  name: string;
  emailAlerts: boolean;
  smsAlerts: boolean;
  query: unknown;
};

export type LeadProfileV2EngagementOverview = {
  stats: {
    views24h: number;
    saves: number;
    alerts: number;
    emails: number;
  };
  buyerIntent: LeadProfileV2BuyerIntent;
  matchboardSearch: LeadProfileV2MatchboardSearch | null;
};

export type LeadProfileV2SavedSearch = {
  id: string;
  name: string;
  emailAlerts: boolean;
  smsAlerts: boolean;
  isHomepageActive: boolean;
  query: unknown;
};

export type LeadProfileV2SavedSearchesPanel = {
  savedSearches: LeadProfileV2SavedSearch[];
};

export type LeadProfileV2SavedHome = {
  id: string;
  mlsNumber: string;
};

export type LeadProfileV2SavedHomesPanel = {
  savedListings: LeadProfileV2SavedHome[];
};

export type LeadProfileV2PropertyWatch = {
  id: string;
  mlsNumber: string;
};

export type LeadProfileV2PropertyWatchesPanel = {
  propertyMonitors: LeadProfileV2PropertyWatch[];
};

export type LeadProfileV2AreaMonitor = {
  id: string;
  name: string;
  city: string;
};

export type LeadProfileV2AreaMonitorsPanel = {
  areaMonitors: LeadProfileV2AreaMonitor[];
};

export type LeadProfileV2RoutePlannerStop = {
  mlsNumber: string;
};

export type LeadProfileV2RoutePlannerTour = {
  id: string;
  name: string;
  status: ViewingTourStatus;
  stopCount: number;
  stops: LeadProfileV2RoutePlannerStop[];
};

export type LeadProfileV2RoutePlannerPanel = {
  tours: LeadProfileV2RoutePlannerTour[];
};

export type LeadProfileV2ListingNote = {
  id: string;
  mlsNumber: string;
  body: string;
};

export type LeadProfileV2ListingNotesPanel = {
  listingNotes: LeadProfileV2ListingNote[];
};

export type LeadProfileV2Alert = {
  id: string;
  title: string;
  kind: CustomerAlertKind;
};

export type LeadProfileV2AlertsPanel = {
  alerts: LeadProfileV2Alert[];
};

export type LeadProfileV2RailHot = {
  hotness: number;
  views24h: number;
  distinctListings24h: number;
  isOnline: boolean;
  binge: boolean;
  lastSeenAt: string | null;
  slaHoursOpen: number | null;
};

export type LeadProfileV2RailPanel = {
  stats: {
    saves: number;
    savedSearches: number;
    alerts: number;
    emails: number;
  };
  hot: LeadProfileV2RailHot;
};

/** Serialized Activity row. Matches current CrmTimeline DTO, not Legacy LeadSummary. */
export type LeadProfileV2TimelineItem = {
  id: string;
  source: string;
  type: string;
  title: string;
  body: string | null;
  mlsNumber: string | null;
  path: string | null;
  imageUrl: string | null;
  createdAt: string;
  noteId?: string | null;
  noteCategory?: "GENERAL" | "CALL" | null;
  pinned?: boolean;
  pinnedAt?: string | null;
  emailPreviewPath?: string | null;
  emailKind?: string | null;
  emailOpenedAt?: string | null;
  emailClickedAt?: string | null;
  emailOpenCount?: number;
  emailClickCount?: number;
  lastClickedUrl?: string | null;
  conversationChannel?: "SMS" | "CHAT" | null;
  conversationDirection?: "inbound" | "outbound" | null;
  conversationAutomationKey?: string | null;
  conversationRecipient?: "LEAD" | "AGENT" | null;
};

export type LeadProfileV2TimelinePage = {
  items: LeadProfileV2TimelineItem[];
  hasMore: boolean;
  scope: "recent" | "history";
};

export type LeadProfileV2Permissions = {
  canSeeTeamLeads: boolean;
  canAssignLeads: boolean;
  canClaim: boolean;
  consented: boolean;
};

export type LeadProfileV2TeamMember = {
  user: { id: string; name: string | null; email: string };
};

export type LeadProfileV2Customer = {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  phoneE164: string | null;
  isBuyer: boolean;
  isSeller: boolean;
  purchaseTimeframe: string | null;
  emailVerified: string | null;
  createdAt: string;
  caslConsentAt: string | null;
  termsAcceptedAt: string | null;
  vowAcceptedAt: string | null;
  homeAddress: string | null;
  emailUpdateRequestedAt: string | null;
  phoneUpdateRequestedAt: string | null;
};

export type LeadProfileV2Lead = {
  id: string;
  status: LeadStatus;
  source: string;
  score: number;
  notes: string | null;
  listingMls: string | null;
  inquiryTag: InquiryTag | null;
  assignedAgentId: string | null;
  createdAt: string;
  statusChangedAt: string;
  firstRespondedAt: string | null;
  contactConsentAt: string | null;
  lostReason: string | null;
  winReason: string | null;
  utmSource: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  customer: LeadProfileV2Customer | null;
  assignedAgent: { id: string; name: string | null; email: string } | null;
  adCampaign: { id: string; name: string } | null;
};

/** Identity / contact / pipeline / assign. No timeline, hotness, or collections. */
export type LeadProfileV2Shell = {
  lead: LeadProfileV2Lead;
  permissions: LeadProfileV2Permissions;
  teamMembers: LeadProfileV2TeamMember[];
  lastTouchAt: string;
};
