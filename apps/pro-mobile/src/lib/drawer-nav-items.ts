/**
 * Stage 5.2 — Instant Shell drawer navigation items (no React Native imports).
 */

export interface DrawerItem {
  id: string;
  label: string;
  icon: string;
  /** Primary bottom-nav tab destination */
  tabKey?: "launchpad" | "leads" | "tasks" | "calendar" | "more";
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
    | "search";
}

export const DRAWER_NAV_ITEMS: DrawerItem[] = [
  { id: "launchpad", label: "Launchpad", icon: "⌂", tabKey: "launchpad" },
  { id: "leads", label: "Leads", icon: "👥", tabKey: "leads" },
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
];
