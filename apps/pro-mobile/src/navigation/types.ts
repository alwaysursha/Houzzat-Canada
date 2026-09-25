/**
 * Auth/workspace state remains authoritative. These routes mirror that state.
 * Agent primary tabs are real bottom-tab routes (Phase 2).
 * Chat Thread and Owner/Admin shells are not tab routes.
 * Lead Profile is a nested native-stack route owned by the Leads tab.
 */

export type RootStackParamList = {
  Splash: undefined;
  BootstrapRetry: undefined;
  SignIn: undefined;
  WorkspaceSelection: undefined;
  AppRoot: undefined;
};

/** Phase 3 — Leads tab nested stack. List is root; profile is pushed. */
export type LeadsStackParamList = {
  LeadsList: undefined;
  LeadProfile: { leadId: string; leadIds?: string[] };
};

/** Phase 2 — Agent primary tabs. Tasks is a drawer route, hidden from the bar. */
export type AgentTabParamList = {
  Launchpad: undefined;
  Leads: { screen?: keyof LeadsStackParamList; params?: LeadsStackParamList[keyof LeadsStackParamList] } | undefined;
  Chats: undefined;
  Calendar: undefined;
  More: undefined;
  Tasks: undefined;
};

export type AgentTabRouteName = keyof AgentTabParamList;
