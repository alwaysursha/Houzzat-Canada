/**
 * Stage 5.2 — Instant Shell drawer navigation items (no React Native imports).
 */

export interface DrawerItem {
  id: string;
  label: string;
  icon: string;
  /** Primary bottom-nav tab destination (Agent shell) */
  tabKey?: "launchpad" | "leads" | "chats" | "tasks" | "calendar" | "more";
  /**
   * Stage 5.2 — secondary Instant Shell drawer utilities.
   * `account` opens the More hub; others open native coming-later screens.
   */
  utilityId?:
    | "account"
    | "statistics"
    | "inbox"
    | "cma"
    | "team"
    | "notifications"
    | "search"
    | "shortlist";
}

/**
 * Agent drawer — Tasks remains available here (not on bottom nav).
 * Bottom nav: Launchpad | Leads | Chats | Calendar | More
 */
export const DRAWER_NAV_ITEMS: DrawerItem[] = [
  { id: "launchpad", label: "Launchpad", icon: "⌂", tabKey: "launchpad" },
  { id: "leads", label: "Leads", icon: "👥", tabKey: "leads" },
  { id: "chats", label: "Chats", icon: "💬", tabKey: "chats" },
  { id: "tasks", label: "Tasks", icon: "✓", tabKey: "tasks" },
  { id: "calendar", label: "Calendar", icon: "📅", tabKey: "calendar" },
  { id: "account", label: "Account", icon: "👤", tabKey: "more", utilityId: "account" },
  {
    id: "statistics",
    label: "Statistics",
    icon: "📊",
    utilityId: "statistics",
  },
  { id: "inbox", label: "Communications", icon: "✉", utilityId: "inbox" },
  { id: "cma", label: "CMA", icon: "📈", utilityId: "cma" },
  { id: "team", label: "Team", icon: "👥", utilityId: "team" },
  {
    id: "notifications",
    label: "Notifications",
    icon: "🔔",
    utilityId: "notifications",
  },
  { id: "search", label: "Properties", icon: "🔍", utilityId: "search" },
  { id: "shortlist", label: "Shortlist", icon: "♥", utilityId: "shortlist" },
];

/** Final Agent bottom-nav labels (locked). */
export const AGENT_BOTTOM_NAV_LABELS = [
  "Launchpad",
  "Leads",
  "Chats",
  "Calendar",
  "More",
] as const;

/** Final Admin/Owner bottom-nav labels (locked). */
export const ADMIN_BOTTOM_NAV_LABELS = [
  "Overview",
  "Lead Routing",
  "People",
  "CRM",
  "More",
] as const;
