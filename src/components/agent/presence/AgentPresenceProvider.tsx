"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import {
  useAgentPresencePublisher,
  type AgentPresencePublisherState,
} from "@/components/agent/presence/useAgentPresencePublisher";

const AgentPresenceContext = createContext<AgentPresencePublisherState | null>(
  null,
);

/**
 * Mount once in AgentShell so desktop, mobile drawer, and InstantShell share
 * a single activity/heartbeat publisher.
 */
export function AgentPresenceProvider({ children }: { children: ReactNode }) {
  const value = useAgentPresencePublisher();
  return (
    <AgentPresenceContext.Provider value={value}>
      {children}
    </AgentPresenceContext.Provider>
  );
}

export function useAgentPresence(): AgentPresencePublisherState {
  const ctx = useContext(AgentPresenceContext);
  if (!ctx) {
    throw new Error("useAgentPresence requires AgentPresenceProvider");
  }
  return ctx;
}
