-- Production baseline: schema state before Stage 1 Workspace foundation.
-- Historical bookkeeping only — DO NOT re-run on production.
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('BUYER', 'SELLER', 'AGENT', 'ADMIN');

-- CreateEnum
CREATE TYPE "ActiveMode" AS ENUM ('BUYER', 'SELLER');

-- CreateEnum
CREATE TYPE "RelatedListingsMode" AS ENUM ('SAME_AREA', 'SAME_FEATURES');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW_LEAD', 'ATTEMPTED_CONTACT', 'CONTACTED', 'APPT_SET', 'APPT_MET', 'ACTIVE_CLIENT', 'PENDING_CLIENT', 'PAST_CLIENT');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('PROPERTY_INQUIRY', 'SHOWING_REQUEST', 'VIRTUAL_VIEWING', 'HOME_VALUATION', 'BUYER_SESSION', 'SAVED_SEARCH', 'LANDING_PAGE', 'OPEN_HOUSE', 'PAID_AD', 'AFFORDABILITY', 'SELLER_READINESS', 'SIGNUP', 'OTHER');

-- CreateEnum
CREATE TYPE "LeadIntent" AS ENUM ('BUYER', 'SELLER');

-- CreateEnum
CREATE TYPE "SellerLeadAssignMode" AS ENUM ('LISTING_AGENT', 'PERCENTAGE');

-- CreateEnum
CREATE TYPE "LeadRoutingLane" AS ENUM ('BUYER', 'SELLER');

-- CreateEnum
CREATE TYPE "InquiryTag" AS ENUM ('VIEWING', 'HOME_VALUE', 'PROPERTY_DETAILS', 'GENERAL');

-- CreateEnum
CREATE TYPE "PurchaseTimeframe" AS ENUM ('NOW', 'ONE_TO_THREE_MONTHS', 'SIX_TO_TWELVE_MONTHS', 'TWELVE_PLUS_MONTHS');

-- CreateEnum
CREATE TYPE "LeadNoteCategory" AS ENUM ('GENERAL', 'CALL');

-- CreateEnum
CREATE TYPE "AppointmentType" AS ENUM ('SHOWING', 'VIRTUAL_VIEWING', 'BUYER_SESSION', 'VALUATION_CALL');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'RESCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrgMembershipRole" AS ENUM ('OWNER', 'ADMIN', 'AGENT');

-- CreateEnum
CREATE TYPE "AgentTaskType" AS ENUM ('CALL', 'EMAIL', 'TODO');

-- CreateEnum
CREATE TYPE "AgentTaskStatus" AS ENUM ('OPEN', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ViewingTourStatus" AS ENUM ('DRAFT', 'REQUESTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AreaMonitorTransaction" AS ENUM ('SALE', 'LEASE', 'ALL');

-- CreateEnum
CREATE TYPE "CustomerAlertKind" AS ENUM ('PRICE_CHANGE', 'STATUS_CHANGE', 'OWNER_STATUS_CHANGE', 'AREA_NEW', 'AREA_SOLD', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('ACTIVE', 'SOLD_CONDITIONAL', 'SOLD', 'LEASED', 'SUSPENDED', 'EXPIRED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "ListingTransactionType" AS ENUM ('SALE', 'LEASE');

-- CreateEnum
CREATE TYPE "OwnerListingStatus" AS ENUM ('DRAFT', 'PENDING_PAYMENT', 'PENDING_REVIEW', 'ACTIVE', 'PAUSED', 'EXPIRED', 'CANCELLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "OwnerPaymentStatus" AS ENUM ('PENDING', 'PAID', 'WAIVED', 'FAILED');

-- CreateEnum
CREATE TYPE "OwnerConsentKind" AS ENUM ('LISTING_TERMS', 'COOP_COMMISSION');

-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('DETACHED', 'SEMI_DETACHED', 'TOWNHOUSE', 'CONDO_APT', 'CONDO_TOWNHOUSE', 'MULTIPLEX', 'VACANT_LAND', 'OFFICE', 'RETAIL', 'INDUSTRIAL', 'MIXED_USE', 'OTHER');

-- CreateEnum
CREATE TYPE "ListingSegment" AS ENUM ('RESIDENTIAL', 'COMMERCIAL', 'PRE_CONSTRUCTION');

-- CreateEnum
CREATE TYPE "PoiType" AS ENUM ('SCHOOL', 'PARK', 'TRANSIT', 'GROCERY', 'OTHER');

-- CreateEnum
CREATE TYPE "AdPlatform" AS ENUM ('META', 'GOOGLE', 'BOTH');

-- CreateEnum
CREATE TYPE "AdCampaignGoal" AS ENUM ('BUYER', 'SELLER', 'OPEN_HOUSE', 'VALUATION', 'BRAND');

-- CreateEnum
CREATE TYPE "AdCampaignStatus" AS ENUM ('DRAFT', 'READY', 'EXPORTED', 'PUBLISH_STUB');

-- CreateEnum
CREATE TYPE "AdSourceType" AS ENUM ('LISTING', 'LANDING', 'OPEN_HOUSE', 'AREA', 'VALUATION');

-- CreateEnum
CREATE TYPE "PartnerType" AS ENUM ('MORTGAGE', 'LAWYER', 'INSPECTOR', 'OTHER');

-- CreateEnum
CREATE TYPE "HandoffStatus" AS ENUM ('SENT', 'VIEWED', 'ACCEPTED', 'DECLINED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ActivityEventType" AS ENUM ('PAGE_VIEW', 'HEARTBEAT', 'LISTING_VIEW', 'SEARCH', 'SAVE_LISTING', 'UNSAVE_LISTING', 'SAVE_SEARCH', 'WATCH_PROPERTY', 'WATCH_AREA', 'NOTE', 'LEAD', 'SIGN_IN', 'SIGN_UP', 'ROUTE_PLANNER', 'LANDING_VIEW', 'OTHER');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "seatLimit" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMembership" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "OrgMembershipRole" NOT NULL DEFAULT 'AGENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationInvite" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "OrgMembershipRole" NOT NULL DEFAULT 'AGENT',
    "token" TEXT NOT NULL,
    "invitedById" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "password" TEXT,
    "image" TEXT,
    "role" "Role" NOT NULL DEFAULT 'BUYER',
    "isBuyer" BOOLEAN NOT NULL DEFAULT true,
    "isSeller" BOOLEAN NOT NULL DEFAULT false,
    "purchaseTimeframe" "PurchaseTimeframe",
    "activeMode" "ActiveMode" NOT NULL DEFAULT 'BUYER',
    "phone" TEXT,
    "phoneVerifiedAt" TIMESTAMP(3),
    "emailUpdateRequestedAt" TIMESTAMP(3),
    "phoneUpdateRequestedAt" TIMESTAMP(3),
    "homeAddress" TEXT,
    "homeLat" DOUBLE PRECISION,
    "homeLng" DOUBLE PRECISION,
    "caslConsentAt" TIMESTAMP(3),
    "vowAcceptedAt" TIMESTAMP(3),
    "vowVersion" TEXT,
    "termsAcceptedAt" TIMESTAMP(3),
    "termsVersion" TEXT,
    "emailAlertsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "smsAlertsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "relatedListingsMode" "RelatedListingsMode" NOT NULL DEFAULT 'SAME_AREA',
    "lastBuyerDigestAt" TIMESTAMP(3),
    "lastSellerReportAt" TIMESTAMP(3),
    "pushNotificationPrefs" JSONB,
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "shell" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "AgentProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bio" TEXT,
    "markets" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW_LEAD',
    "source" "LeadSource" NOT NULL DEFAULT 'OTHER',
    "intent" "LeadIntent" NOT NULL DEFAULT 'BUYER',
    "score" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "listingMls" TEXT,
    "customerId" TEXT,
    "assignedAgentId" TEXT,
    "organizationId" TEXT,
    "landingPageId" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "adCampaignId" TEXT,
    "contactConsentAt" TIMESTAMP(3),
    "firstRespondedAt" TIMESTAMP(3),
    "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inquiryTag" "InquiryTag",
    "lostReason" TEXT,
    "winReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmRoutingSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "listingAgentId" TEXT,
    "sellerAssignMode" "SellerLeadAssignMode" NOT NULL DEFAULT 'LISTING_AGENT',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmRoutingSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmRoutingWeight" (
    "id" TEXT NOT NULL,
    "settingsId" TEXT NOT NULL DEFAULT 'default',
    "agentId" TEXT NOT NULL,
    "lane" "LeadRoutingLane" NOT NULL,
    "percent" INTEGER NOT NULL DEFAULT 0,
    "assignedCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CrmRoutingWeight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTask" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT,
    "assigneeId" TEXT NOT NULL,
    "createdById" TEXT,
    "type" "AgentTaskType" NOT NULL DEFAULT 'TODO',
    "status" "AgentTaskStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "body" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadNote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" "LeadNoteCategory" NOT NULL DEFAULT 'GENERAL',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "pinnedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadEmailLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "sentById" TEXT,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "htmlBody" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'custom',
    "mlsNumber" TEXT,
    "providerId" TEXT,
    "openedAt" TIMESTAMP(3),
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "clickedAt" TIMESTAMP(3),
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "lastClickedUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadEmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadActivity" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "body" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "type" "AppointmentType" NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'REQUESTED',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "listingMls" TEXT,
    "notes" TEXT,
    "focusNotes" TEXT,
    "videoJoinUrl" TEXT,
    "customerId" TEXT,
    "agentId" TEXT,
    "leadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandingPage" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "headline" TEXT,
    "subtitle" TEXT,
    "ctaLabel" TEXT DEFAULT 'Get started',
    "ctaHref" TEXT DEFAULT '/home-valuation',
    "heroImageUrl" TEXT,
    "areaFocus" TEXT,
    "utmCampaign" TEXT,
    "content" JSONB,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "ownerAgentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LandingPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "leadId" TEXT,
    "email" TEXT,
    "kind" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MlsSyncCursor" (
    "id" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "cursor" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MlsSyncCursor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MlsSyncRun" (
    "id" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "message" TEXT,
    "stats" JSONB,

    CONSTRAINT "MlsSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedListing" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mlsNumber" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViewingTour" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Route Planner',
    "status" "ViewingTourStatus" NOT NULL DEFAULT 'DRAFT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startAddress" TEXT,
    "startLat" DOUBLE PRECISION,
    "startLng" DOUBLE PRECISION,
    "startAt" TIMESTAMP(3),
    "defaultDwellMinutes" INTEGER NOT NULL DEFAULT 30,
    "bufferMinutes" INTEGER NOT NULL DEFAULT 5,
    "shareToken" TEXT,
    "requestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ViewingTour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViewingTourStop" (
    "id" TEXT NOT NULL,
    "tourId" TEXT NOT NULL,
    "mlsNumber" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "dwellMinutes" INTEGER,
    "notes" TEXT,
    "driveFromPrevSeconds" INTEGER,
    "driveFromPrevMeters" INTEGER,
    "suggestedArriveAt" TIMESTAMP(3),
    "suggestedLeaveAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ViewingTourStop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedSearch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" JSONB NOT NULL,
    "emailAlerts" BOOLEAN NOT NULL DEFAULT true,
    "smsAlerts" BOOLEAN NOT NULL DEFAULT false,
    "isHomepageActive" BOOLEAN NOT NULL DEFAULT false,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "lastAlertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingView" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "mlsNumber" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mlsNumber" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListingNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyMonitor" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mlsNumber" TEXT NOT NULL,
    "emailAlerts" BOOLEAN NOT NULL DEFAULT true,
    "lastKnownPrice" INTEGER NOT NULL,
    "lastKnownStatus" "ListingStatus" NOT NULL,
    "lastKnownOwnerStatus" "OwnerListingStatus",
    "lastAlertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyMonitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AreaMonitor" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "community" TEXT,
    "transactionType" "AreaMonitorTransaction" NOT NULL DEFAULT 'SALE',
    "segment" "ListingSegment",
    "notifyNew" BOOLEAN NOT NULL DEFAULT true,
    "notifySold" BOOLEAN NOT NULL DEFAULT true,
    "emailAlerts" BOOLEAN NOT NULL DEFAULT true,
    "lastAlertedAt" TIMESTAMP(3),
    "lastSeenListingAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AreaMonitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerAlert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "CustomerAlertKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "mlsNumber" TEXT,
    "areaMonitorId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "mlsNumber" TEXT NOT NULL,
    "listingKey" TEXT,
    "status" "ListingStatus" NOT NULL DEFAULT 'ACTIVE',
    "segment" "ListingSegment" NOT NULL DEFAULT 'RESIDENTIAL',
    "transactionType" "ListingTransactionType" NOT NULL DEFAULT 'SALE',
    "dataSource" TEXT NOT NULL DEFAULT 'mock',
    "propertyType" "PropertyType" NOT NULL DEFAULT 'DETACHED',
    "listPrice" INTEGER NOT NULL,
    "soldPrice" INTEGER,
    "beds" DOUBLE PRECISION NOT NULL,
    "baths" DOUBLE PRECISION NOT NULL,
    "sqft" INTEGER,
    "parkingSpaces" INTEGER NOT NULL DEFAULT 0,
    "yearBuilt" INTEGER,
    "taxes" INTEGER,
    "maintenanceFee" INTEGER,
    "addressLine" TEXT NOT NULL,
    "unitNumber" TEXT,
    "city" TEXT NOT NULL,
    "community" TEXT,
    "postalCode" TEXT,
    "province" TEXT NOT NULL DEFAULT 'ON',
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "brokerageName" TEXT NOT NULL,
    "facts" JSONB,
    "listedAt" TIMESTAMP(3) NOT NULL,
    "soldAt" TIMESTAMP(3),
    "updatedAtMls" TIMESTAMP(3) NOT NULL,
    "daysOnMarket" INTEGER NOT NULL DEFAULT 0,
    "addressHistoryEnrichedAt" TIMESTAMP(3),
    "isMock" BOOLEAN NOT NULL DEFAULT true,
    "ownerUserId" TEXT,
    "ownerStatus" "OwnerListingStatus",
    "listedUntil" TIMESTAMP(3),
    "ownerReviewedAt" TIMESTAMP(3),
    "ownerReviewedById" TEXT,
    "ownerReviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingRoom" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "roomKey" TEXT NOT NULL,
    "roomType" TEXT NOT NULL,
    "roomLevel" TEXT,
    "dimensions" TEXT,
    "length" DOUBLE PRECISION,
    "width" DOUBLE PRECISION,
    "units" TEXT,
    "features" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListingRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnerTitleParty" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "licenseImageUrl" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnerTitleParty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnerListingOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "baseAmount" INTEGER NOT NULL,
    "addOns" JSONB NOT NULL,
    "discountAmount" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "paymentStatus" "OwnerPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "stripeCheckoutSessionId" TEXT,
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnerListingOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnerListingConsent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "kind" "OwnerConsentKind" NOT NULL,
    "version" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnerListingConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingMedia" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ListingMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpenHouse" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "OpenHouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingHistory" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "price" INTEGER,
    "originalPrice" INTEGER,
    "contractDate" TIMESTAMP(3) NOT NULL,
    "lastUpdatedAt" TIMESTAMP(3),
    "externalMls" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'restricted',
    "note" TEXT,

    CONSTRAINT "ListingHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Poi" (
    "id" TEXT NOT NULL,
    "type" "PoiType" NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'seed',
    "sourceId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Poi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeoPlace" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "community" TEXT,
    "displayName" TEXT NOT NULL,
    "summary" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeoPlace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiContentCache" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'template',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiContentCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "goal" "AdCampaignGoal" NOT NULL DEFAULT 'BUYER',
    "platform" "AdPlatform" NOT NULL DEFAULT 'BOTH',
    "status" "AdCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "sourceType" "AdSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "destinationUrl" TEXT NOT NULL,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "audienceHints" JSONB,
    "complianceNotes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "assignedAgentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdCreative" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "platform" "AdPlatform" NOT NULL,
    "headlines" TEXT[],
    "primaryTexts" TEXT[],
    "descriptions" TEXT[],
    "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "imagePresets" JSONB,
    "exportBundle" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdCreative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdAccountConnection" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "accountLabel" TEXT,
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdAccountConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CmaReport" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "listingMls" TEXT,
    "subjectAddress" TEXT,
    "city" TEXT NOT NULL,
    "community" TEXT,
    "beds" DOUBLE PRECISION,
    "baths" DOUBLE PRECISION,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "summary" TEXT NOT NULL,
    "comps" JSONB NOT NULL,
    "agentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CmaReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralPartner" (
    "id" TEXT NOT NULL,
    "type" "PartnerType" NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "city" TEXT,
    "bio" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "portalToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralPartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralHandoff" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "leadId" TEXT,
    "customerName" TEXT,
    "customerEmail" TEXT,
    "listingMls" TEXT,
    "notes" TEXT,
    "status" "HandoffStatus" NOT NULL DEFAULT 'SENT',
    "viewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralHandoff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteVisitor" (
    "id" TEXT NOT NULL,
    "visitorKey" TEXT NOT NULL,
    "userId" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteVisitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteSession" (
    "id" TEXT NOT NULL,
    "sessionKey" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "landingPath" TEXT,
    "landingReferrer" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "pageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL,
    "type" "ActivityEventType" NOT NULL,
    "visitorId" TEXT,
    "sessionId" TEXT,
    "userId" TEXT,
    "path" TEXT,
    "title" TEXT,
    "mlsNumber" TEXT,
    "referrer" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "OrganizationMembership_userId_idx" ON "OrganizationMembership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMembership_organizationId_userId_key" ON "OrganizationMembership"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationInvite_token_key" ON "OrganizationInvite"("token");

-- CreateIndex
CREATE INDEX "OrganizationInvite_organizationId_email_idx" ON "OrganizationInvite"("organizationId", "email");

-- CreateIndex
CREATE INDEX "OrganizationInvite_token_idx" ON "OrganizationInvite"("token");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PushDevice_token_key" ON "PushDevice"("token");

-- CreateIndex
CREATE INDEX "PushDevice_userId_shell_idx" ON "PushDevice"("userId", "shell");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "AgentProfile_userId_key" ON "AgentProfile"("userId");

-- CreateIndex
CREATE INDEX "Lead_status_assignedAgentId_idx" ON "Lead"("status", "assignedAgentId");

-- CreateIndex
CREATE INDEX "Lead_organizationId_status_idx" ON "Lead"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Lead_organizationId_assignedAgentId_idx" ON "Lead"("organizationId", "assignedAgentId");

-- CreateIndex
CREATE INDEX "Lead_source_idx" ON "Lead"("source");

-- CreateIndex
CREATE INDEX "Lead_intent_status_idx" ON "Lead"("intent", "status");

-- CreateIndex
CREATE INDEX "Lead_utmCampaign_idx" ON "Lead"("utmCampaign");

-- CreateIndex
CREATE INDEX "Lead_adCampaignId_idx" ON "Lead"("adCampaignId");

-- CreateIndex
CREATE INDEX "CrmRoutingWeight_settingsId_lane_idx" ON "CrmRoutingWeight"("settingsId", "lane");

-- CreateIndex
CREATE UNIQUE INDEX "CrmRoutingWeight_settingsId_agentId_lane_key" ON "CrmRoutingWeight"("settingsId", "agentId", "lane");

-- CreateIndex
CREATE INDEX "AgentTask_assigneeId_status_dueAt_idx" ON "AgentTask"("assigneeId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "AgentTask_organizationId_status_dueAt_idx" ON "AgentTask"("organizationId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "AgentTask_leadId_status_idx" ON "AgentTask"("leadId", "status");

-- CreateIndex
CREATE INDEX "LeadNote_leadId_createdAt_idx" ON "LeadNote"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "LeadNote_leadId_pinned_pinnedAt_idx" ON "LeadNote"("leadId", "pinned", "pinnedAt");

-- CreateIndex
CREATE INDEX "LeadNote_organizationId_createdAt_idx" ON "LeadNote"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LeadEmailLog_providerId_key" ON "LeadEmailLog"("providerId");

-- CreateIndex
CREATE INDEX "LeadEmailLog_leadId_createdAt_idx" ON "LeadEmailLog"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "LeadEmailLog_organizationId_createdAt_idx" ON "LeadEmailLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "LeadEmailLog_kind_createdAt_idx" ON "LeadEmailLog"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "LeadActivity_leadId_createdAt_idx" ON "LeadActivity"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "Appointment_status_startsAt_idx" ON "Appointment"("status", "startsAt");

-- CreateIndex
CREATE INDEX "Appointment_agentId_status_idx" ON "Appointment"("agentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LandingPage_slug_key" ON "LandingPage"("slug");

-- CreateIndex
CREATE INDEX "ConsentEvent_userId_kind_idx" ON "ConsentEvent"("userId", "kind");

-- CreateIndex
CREATE INDEX "ConsentEvent_leadId_idx" ON "ConsentEvent"("leadId");

-- CreateIndex
CREATE INDEX "ConsentEvent_email_idx" ON "ConsentEvent"("email");

-- CreateIndex
CREATE UNIQUE INDEX "MlsSyncCursor_resource_key" ON "MlsSyncCursor"("resource");

-- CreateIndex
CREATE INDEX "SavedListing_userId_createdAt_idx" ON "SavedListing"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SavedListing_userId_mlsNumber_key" ON "SavedListing"("userId", "mlsNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ViewingTour_shareToken_key" ON "ViewingTour"("shareToken");

-- CreateIndex
CREATE INDEX "ViewingTour_userId_isActive_idx" ON "ViewingTour"("userId", "isActive");

-- CreateIndex
CREATE INDEX "ViewingTour_userId_status_updatedAt_idx" ON "ViewingTour"("userId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "ViewingTourStop_tourId_sortOrder_idx" ON "ViewingTourStop"("tourId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ViewingTourStop_tourId_mlsNumber_key" ON "ViewingTourStop"("tourId", "mlsNumber");

-- CreateIndex
CREATE INDEX "SavedSearch_userId_createdAt_idx" ON "SavedSearch"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SavedSearch_userId_isHomepageActive_idx" ON "SavedSearch"("userId", "isHomepageActive");

-- CreateIndex
CREATE INDEX "SavedSearch_userId_isPrimary_idx" ON "SavedSearch"("userId", "isPrimary");

-- CreateIndex
CREATE INDEX "ListingView_userId_createdAt_idx" ON "ListingView"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ListingView_mlsNumber_createdAt_idx" ON "ListingView"("mlsNumber", "createdAt");

-- CreateIndex
CREATE INDEX "ListingNote_userId_updatedAt_idx" ON "ListingNote"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ListingNote_userId_mlsNumber_key" ON "ListingNote"("userId", "mlsNumber");

-- CreateIndex
CREATE INDEX "PropertyMonitor_userId_createdAt_idx" ON "PropertyMonitor"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyMonitor_userId_mlsNumber_key" ON "PropertyMonitor"("userId", "mlsNumber");

-- CreateIndex
CREATE INDEX "AreaMonitor_userId_createdAt_idx" ON "AreaMonitor"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AreaMonitor_city_community_idx" ON "AreaMonitor"("city", "community");

-- CreateIndex
CREATE INDEX "CustomerAlert_userId_createdAt_idx" ON "CustomerAlert"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerAlert_userId_readAt_idx" ON "CustomerAlert"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_mlsNumber_key" ON "Listing"("mlsNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_listingKey_key" ON "Listing"("listingKey");

-- CreateIndex
CREATE INDEX "Listing_status_city_listPrice_idx" ON "Listing"("status", "city", "listPrice");

-- CreateIndex
CREATE INDEX "Listing_status_community_listPrice_idx" ON "Listing"("status", "community", "listPrice");

-- CreateIndex
CREATE INDEX "Listing_segment_status_city_idx" ON "Listing"("segment", "status", "city");

-- CreateIndex
CREATE INDEX "Listing_transactionType_segment_status_city_idx" ON "Listing"("transactionType", "segment", "status", "city");

-- CreateIndex
CREATE INDEX "Listing_dataSource_ownerStatus_status_idx" ON "Listing"("dataSource", "ownerStatus", "status");

-- CreateIndex
CREATE INDEX "Listing_ownerUserId_idx" ON "Listing"("ownerUserId");

-- CreateIndex
CREATE INDEX "Listing_lat_lng_idx" ON "Listing"("lat", "lng");

-- CreateIndex
CREATE INDEX "Listing_listedAt_idx" ON "Listing"("listedAt");

-- CreateIndex
CREATE INDEX "Listing_addressLine_idx" ON "Listing"("addressLine");

-- CreateIndex
CREATE INDEX "Listing_updatedAtMls_idx" ON "Listing"("updatedAtMls");

-- CreateIndex
CREATE UNIQUE INDEX "ListingRoom_roomKey_key" ON "ListingRoom"("roomKey");

-- CreateIndex
CREATE INDEX "ListingRoom_listingId_sortOrder_idx" ON "ListingRoom"("listingId", "sortOrder");

-- CreateIndex
CREATE INDEX "OwnerTitleParty_listingId_sortOrder_idx" ON "OwnerTitleParty"("listingId", "sortOrder");

-- CreateIndex
CREATE INDEX "OwnerListingOrder_userId_createdAt_idx" ON "OwnerListingOrder"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "OwnerListingOrder_listingId_idx" ON "OwnerListingOrder"("listingId");

-- CreateIndex
CREATE INDEX "OwnerListingOrder_paymentStatus_idx" ON "OwnerListingOrder"("paymentStatus");

-- CreateIndex
CREATE INDEX "OwnerListingConsent_userId_idx" ON "OwnerListingConsent"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OwnerListingConsent_listingId_kind_version_key" ON "OwnerListingConsent"("listingId", "kind", "version");

-- CreateIndex
CREATE INDEX "ListingMedia_listingId_sortOrder_idx" ON "ListingMedia"("listingId", "sortOrder");

-- CreateIndex
CREATE INDEX "OpenHouse_startsAt_idx" ON "OpenHouse"("startsAt");

-- CreateIndex
CREATE INDEX "OpenHouse_listingId_idx" ON "OpenHouse"("listingId");

-- CreateIndex
CREATE INDEX "ListingHistory_listingId_contractDate_idx" ON "ListingHistory"("listingId", "contractDate");

-- CreateIndex
CREATE INDEX "Poi_type_lat_lng_idx" ON "Poi"("type", "lat", "lng");

-- CreateIndex
CREATE INDEX "Poi_city_type_idx" ON "Poi"("city", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Poi_source_sourceId_key" ON "Poi"("source", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "GeoPlace_slug_key" ON "GeoPlace"("slug");

-- CreateIndex
CREATE INDEX "GeoPlace_city_community_idx" ON "GeoPlace"("city", "community");

-- CreateIndex
CREATE INDEX "AiContentCache_contentHash_idx" ON "AiContentCache"("contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "AiContentCache_entityType_entityId_key" ON "AiContentCache"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AdCampaign_status_createdAt_idx" ON "AdCampaign"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AdCampaign_sourceType_sourceId_idx" ON "AdCampaign"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "AdCreative_campaignId_idx" ON "AdCreative"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "AdAccountConnection_provider_key" ON "AdAccountConnection"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "CmaReport_token_key" ON "CmaReport"("token");

-- CreateIndex
CREATE INDEX "CmaReport_agentId_createdAt_idx" ON "CmaReport"("agentId", "createdAt");

-- CreateIndex
CREATE INDEX "CmaReport_listingMls_idx" ON "CmaReport"("listingMls");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralPartner_portalToken_key" ON "ReferralPartner"("portalToken");

-- CreateIndex
CREATE INDEX "ReferralPartner_type_active_idx" ON "ReferralPartner"("type", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralHandoff_token_key" ON "ReferralHandoff"("token");

-- CreateIndex
CREATE INDEX "ReferralHandoff_partnerId_status_idx" ON "ReferralHandoff"("partnerId", "status");

-- CreateIndex
CREATE INDEX "ReferralHandoff_agentId_createdAt_idx" ON "ReferralHandoff"("agentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SiteVisitor_visitorKey_key" ON "SiteVisitor"("visitorKey");

-- CreateIndex
CREATE INDEX "SiteVisitor_userId_idx" ON "SiteVisitor"("userId");

-- CreateIndex
CREATE INDEX "SiteVisitor_lastSeenAt_idx" ON "SiteVisitor"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "SiteSession_sessionKey_key" ON "SiteSession"("sessionKey");

-- CreateIndex
CREATE INDEX "SiteSession_visitorId_lastSeenAt_idx" ON "SiteSession"("visitorId", "lastSeenAt");

-- CreateIndex
CREATE INDEX "SiteSession_lastSeenAt_idx" ON "SiteSession"("lastSeenAt");

-- CreateIndex
CREATE INDEX "ActivityEvent_createdAt_idx" ON "ActivityEvent"("createdAt");

-- CreateIndex
CREATE INDEX "ActivityEvent_visitorId_createdAt_idx" ON "ActivityEvent"("visitorId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityEvent_sessionId_createdAt_idx" ON "ActivityEvent"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityEvent_userId_createdAt_idx" ON "ActivityEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityEvent_type_createdAt_idx" ON "ActivityEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityEvent_mlsNumber_createdAt_idx" ON "ActivityEvent"("mlsNumber", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationInvite" ADD CONSTRAINT "OrganizationInvite_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushDevice" ADD CONSTRAINT "PushDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentProfile" ADD CONSTRAINT "AgentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assignedAgentId_fkey" FOREIGN KEY ("assignedAgentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_landingPageId_fkey" FOREIGN KEY ("landingPageId") REFERENCES "LandingPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_adCampaignId_fkey" FOREIGN KEY ("adCampaignId") REFERENCES "AdCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmRoutingSettings" ADD CONSTRAINT "CrmRoutingSettings_listingAgentId_fkey" FOREIGN KEY ("listingAgentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmRoutingWeight" ADD CONSTRAINT "CrmRoutingWeight_settingsId_fkey" FOREIGN KEY ("settingsId") REFERENCES "CrmRoutingSettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmRoutingWeight" ADD CONSTRAINT "CrmRoutingWeight_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadNote" ADD CONSTRAINT "LeadNote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadNote" ADD CONSTRAINT "LeadNote_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadNote" ADD CONSTRAINT "LeadNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadEmailLog" ADD CONSTRAINT "LeadEmailLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadEmailLog" ADD CONSTRAINT "LeadEmailLog_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadEmailLog" ADD CONSTRAINT "LeadEmailLog_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadActivity" ADD CONSTRAINT "LeadActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadActivity" ADD CONSTRAINT "LeadActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandingPage" ADD CONSTRAINT "LandingPage_ownerAgentId_fkey" FOREIGN KEY ("ownerAgentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentEvent" ADD CONSTRAINT "ConsentEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedListing" ADD CONSTRAINT "SavedListing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViewingTour" ADD CONSTRAINT "ViewingTour_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViewingTourStop" ADD CONSTRAINT "ViewingTourStop_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "ViewingTour"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedSearch" ADD CONSTRAINT "SavedSearch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingView" ADD CONSTRAINT "ListingView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingNote" ADD CONSTRAINT "ListingNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyMonitor" ADD CONSTRAINT "PropertyMonitor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AreaMonitor" ADD CONSTRAINT "AreaMonitor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAlert" ADD CONSTRAINT "CustomerAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAlert" ADD CONSTRAINT "CustomerAlert_areaMonitorId_fkey" FOREIGN KEY ("areaMonitorId") REFERENCES "AreaMonitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_ownerReviewedById_fkey" FOREIGN KEY ("ownerReviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingRoom" ADD CONSTRAINT "ListingRoom_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerTitleParty" ADD CONSTRAINT "OwnerTitleParty_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerListingOrder" ADD CONSTRAINT "OwnerListingOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerListingOrder" ADD CONSTRAINT "OwnerListingOrder_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerListingOrder" ADD CONSTRAINT "OwnerListingOrder_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerListingConsent" ADD CONSTRAINT "OwnerListingConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerListingConsent" ADD CONSTRAINT "OwnerListingConsent_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingMedia" ADD CONSTRAINT "ListingMedia_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenHouse" ADD CONSTRAINT "OpenHouse_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingHistory" ADD CONSTRAINT "ListingHistory_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaign" ADD CONSTRAINT "AdCampaign_assignedAgentId_fkey" FOREIGN KEY ("assignedAgentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCreative" ADD CONSTRAINT "AdCreative_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CmaReport" ADD CONSTRAINT "CmaReport_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralHandoff" ADD CONSTRAINT "ReferralHandoff_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "ReferralPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralHandoff" ADD CONSTRAINT "ReferralHandoff_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteVisitor" ADD CONSTRAINT "SiteVisitor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteSession" ADD CONSTRAINT "SiteSession_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "SiteVisitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "SiteVisitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SiteSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
