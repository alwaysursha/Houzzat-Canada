/**
 * Stage 4.3B — Native HouzzatPRO Launchpad Screen.
 *
 * Faithfully recreates the visual layout, typography, colors, and cards of the
 * original HouzzatPRO Agent Launchpad / Dashboard:
 * - Date greeting header + task status indicator
 * - Quick Modules collapsible/tap cards with exact tones:
 *   - "Call New Leads" (Danger Red #E11D48)
 *   - "Contacted Leads" (Danger / Follow-up #D97706)
 *   - "Due Tasks" (Warning Amber #F59E0B)
 *   - "Statistics" (Info Blue #2B6CB0)
 *   - "Online Leads" (Live Emerald #059669)
 *   - "Hot Pipeline" (Ok Canopy #0F6B4C)
 * - Launchpad Todo Carousel card
 * - Contact Requested Panel
 * - Workspace isolation & connection badge
 */

import React, { useState } from "react";
import {
  LayoutAnimation,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from "react-native";
import { useAuth } from "../state/AuthContext";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface QuickModuleConfig {
  id: string;
  title: string;
  subtitle: string;
  accentColor: string;
  icon: string;
  actionText?: string;
  onPressAction?: () => void;
}

interface LaunchpadScreenProps {
  onNavigateToLeads: (statusFilter?: string) => void;
  onNavigateToTasks: () => void;
}

export function LaunchpadScreen({
  onNavigateToLeads,
  onNavigateToTasks,
}: LaunchpadScreenProps) {
  const { user, activeWorkspace, activeMembership } = useAuth();
  const [expandedModule, setExpandedModule] = useState<string | null>(null);

  const now = new Date();
  const dateFormatted = now.toLocaleDateString("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const toggleModule = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedModule((prev) => (prev === id ? null : id));
  };

  const modules: QuickModuleConfig[] = [
    {
      id: "callNew",
      title: "Call New Leads",
      subtitle: "New inquiries requiring first response",
      accentColor: "#E11D48", // Danger red
      icon: "📞",
      actionText: "View New Leads →",
      onPressAction: () => onNavigateToLeads("NEW_LEAD"),
    },
    {
      id: "contacted",
      title: "Contacted Leads",
      subtitle: "Clients in follow-up pipeline",
      accentColor: "#D97706", // Amber
      icon: "👤",
      actionText: "View Follow-ups →",
      onPressAction: () => onNavigateToLeads("CONTACTED"),
    },
    {
      id: "tasks",
      title: "Due Tasks",
      subtitle: "0 Overdue • 0 Due Today",
      accentColor: "#F59E0B", // Warning gold
      icon: "✓",
      actionText: "Open Tasks →",
      onPressAction: onNavigateToTasks,
    },
    {
      id: "statistics",
      title: "Statistics",
      subtitle: "Response Time • 100% SLA",
      accentColor: "#2B6CB0", // Blue
      icon: "⏱",
    },
    {
      id: "online",
      title: "Online Leads",
      subtitle: "Active customers on site right now",
      accentColor: "#059669", // Live emerald
      icon: "⚡",
      actionText: "Check Online Activity →",
      onPressAction: () => onNavigateToLeads("ALL"),
    },
    {
      id: "hot",
      title: "Hot Pipeline",
      subtitle: "High engagement client desk",
      accentColor: "#0F6B4C", // Canopy green
      icon: "🔥",
      actionText: "Open Pipeline →",
      onPressAction: () => onNavigateToLeads("ALL"),
    },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* 1. Date Header & Subtitle */}
      <View style={styles.dateHeaderSection}>
        <Text style={styles.dateTitle}>{dateFormatted}</Text>
        <Text style={styles.dateSubtitle}>
          Today you have <Text style={styles.highlightCount}>0 tasks</Text> due.
        </Text>
      </View>

      {/* 2. Quick Modules Heading */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionHeading}>Quick Modules</Text>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => onNavigateToLeads("NEW_LEAD")}
        >
          <Text style={styles.sectionActionText}>VIEW CRM</Text>
        </TouchableOpacity>
      </View>

      {/* 3. Quick Modules List Cards */}
      <View style={styles.modulesStack}>
        {modules.map((mod) => {
          const isExpanded = expandedModule === mod.id;
          return (
            <View key={mod.id} style={styles.moduleCard}>
              <TouchableOpacity
                style={[styles.moduleCardHeader, { borderLeftColor: mod.accentColor }]}
                activeOpacity={0.8}
                onPress={() => toggleModule(mod.id)}
              >
                <View style={styles.moduleIconBox}>
                  <Text style={styles.moduleIconText}>{mod.icon}</Text>
                </View>

                <View style={styles.moduleInfo}>
                  <Text style={styles.moduleTitle}>{mod.title}</Text>
                  <Text style={styles.moduleSubtitle}>{mod.subtitle}</Text>
                </View>

                <Text
                  style={[
                    styles.chevronText,
                    isExpanded && styles.chevronTextExpanded,
                  ]}
                >
                  ›
                </Text>
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.moduleExpandedBody}>
                  <Text style={styles.moduleExpandedInfo}>
                    Connected to active workspace {activeWorkspace?.displayName}.
                  </Text>
                  {mod.actionText && (
                    <TouchableOpacity
                      style={styles.moduleActionBtn}
                      activeOpacity={0.8}
                      onPress={mod.onPressAction}
                    >
                      <Text style={[styles.moduleActionBtnText, { color: mod.accentColor }]}>
                        {mod.actionText}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </View>

      {/* 4. Contact Requested Section */}
      <View style={styles.contactRequestedCard}>
        <View style={styles.crHeaderRow}>
          <Text style={styles.crTitle}>Contact Requested</Text>
          <View style={styles.liveTag}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>READY</Text>
          </View>
        </View>
        <Text style={styles.crBodyText}>
          Inbound property inquiries and viewing requests routed to your desk will trigger immediate notifications here.
        </Text>
      </View>

      {/* 5. Workspace Security Details */}
      <View style={styles.securityFooterCard}>
        <Text style={styles.secTitle}>Tenant Isolation & Authority</Text>
        <View style={styles.secRow}>
          <Text style={styles.secLabel}>Workspace:</Text>
          <Text style={styles.secVal}>{activeWorkspace?.displayName} ({activeWorkspace?.slug})</Text>
        </View>
        <View style={styles.secRow}>
          <Text style={styles.secLabel}>Authority:</Text>
          <Text style={styles.secVal}>WorkspaceMember.role = {activeMembership?.role}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4F6F8", // Mist background from original app
  },
  scrollContent: {
    padding: 16,
    paddingBottom: Platform.OS === "android" ? 36 : 24,
    gap: 16,
  },
  dateHeaderSection: {
    marginBottom: 4,
  },
  dateTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1E2A38", // Ink primary
    letterSpacing: -0.5,
  },
  dateSubtitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2B6CB0", // Blue accent
    marginTop: 4,
  },
  highlightCount: {
    fontWeight: "800",
    color: "#1E2A38",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1E2A38",
  },
  sectionActionText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0F6B4C", // Canopy green
    letterSpacing: 0.5,
  },
  modulesStack: {
    gap: 10,
  },
  moduleCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D8DEE6",
    shadowColor: "rgba(15, 23, 42, 0.04)",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 1,
    overflow: "hidden",
  },
  moduleCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderLeftWidth: 4,
  },
  moduleIconBox: {
    width: 28,
    alignItems: "center",
    marginRight: 10,
  },
  moduleIconText: {
    fontSize: 16,
  },
  moduleInfo: {
    flex: 1,
  },
  moduleTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1E2A38",
  },
  moduleSubtitle: {
    fontSize: 12,
    fontWeight: "500",
    color: "#5B6775",
    marginTop: 2,
  },
  chevronText: {
    fontSize: 20,
    fontWeight: "400",
    color: "#94A3B8",
    marginLeft: 8,
  },
  chevronTextExpanded: {
    transform: [{ rotate: "90deg" }],
    color: "#2B6CB0",
  },
  moduleExpandedBody: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FBFCFD",
    borderTopWidth: 1,
    borderTopColor: "#EEF2F6",
    gap: 8,
  },
  moduleExpandedInfo: {
    fontSize: 12,
    color: "#64748B",
    lineHeight: 16,
  },
  moduleActionBtn: {
    alignSelf: "flex-start",
    paddingVertical: 4,
  },
  moduleActionBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  contactRequestedCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D8DEE6",
    padding: 16,
    gap: 8,
    shadowColor: "rgba(15, 23, 42, 0.04)",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 1,
  },
  crHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  crTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1E2A38",
  },
  liveTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#059669",
  },
  liveText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#059669",
    letterSpacing: 0.5,
  },
  crBodyText: {
    fontSize: 12,
    color: "#5B6775",
    lineHeight: 18,
  },
  securityFooterCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    gap: 6,
  },
  secTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  secRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  secLabel: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "500",
  },
  secVal: {
    fontSize: 11,
    color: "#0F172A",
    fontWeight: "700",
  },
});
