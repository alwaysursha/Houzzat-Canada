/**
 * Stage 4.3B — Native HouzzatPRO Drawer Menu Component.
 *
 * Recreates the exact previous HouzzatPRO mobile drawer:
 * - Brand logo / mark + workspace display name
 * - Navigation links with exact previous items: Launchpad, Leads, Tasks, Calendar, Statistics, Comms, CMA, Team, Notifications, Properties
 * - User email, membership role, and controlled Sign Out
 * - 0ms instant native toggle (pure React state, no network, no self-closing bug)
 */

import React from "react";
import {
  Alert,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { HouzzatProWordmark } from "../components/BrandMark";

export interface DrawerItem {
  id: string;
  label: string;
  icon: string;
  tabKey?: "launchpad" | "leads" | "tasks" | "calendar" | "more";
}

export const DRAWER_NAV_ITEMS: DrawerItem[] = [
  { id: "launchpad", label: "Launchpad", icon: "⌂", tabKey: "launchpad" },
  { id: "leads", label: "Leads", icon: "👥", tabKey: "leads" },
  { id: "tasks", label: "Tasks", icon: "✓", tabKey: "tasks" },
  { id: "calendar", label: "Calendar", icon: "📅", tabKey: "calendar" },
  { id: "statistics", label: "Statistics", icon: "📊", tabKey: "more" },
  { id: "inbox", label: "Communications", icon: "✉", tabKey: "more" },
  { id: "cma", label: "CMA", icon: "📈", tabKey: "more" },
  { id: "team", label: "Team", icon: "👥", tabKey: "more" },
  { id: "notifications", label: "Notifications", icon: "🔔", tabKey: "more" },
  { id: "search", label: "Properties", icon: "🔍", tabKey: "more" },
];

interface NativeDrawerProps {
  visible: boolean;
  onClose: () => void;
  activeItemId: string;
  onSelectItem: (item: DrawerItem) => void;
  brandDisplayName: string;
  orgName: string;
  userEmail: string;
  membershipRole: string;
  hasMultipleWorkspaces: boolean;
  onChangeWorkspace: () => void;
  onSignOut: () => void;
  onSwitchToAgentMode?: () => void;
}

export function NativeDrawer({
  visible,
  onClose,
  activeItemId,
  onSelectItem,
  brandDisplayName,
  orgName,
  userEmail,
  membershipRole,
  hasMultipleWorkspaces,
  onChangeWorkspace,
  onSignOut,
  onSwitchToAgentMode,
}: NativeDrawerProps) {
  if (!visible) return null;

  const handleSignOutPress = () => {
    Alert.alert(
      "Sign Out",
      "Are you sure you want to sign out of HouzzatPRO?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: () => {
            onClose();
            onSignOut();
          },
        },
      ]
    );
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        {/* Backdrop touch area */}
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        {/* Drawer Slide-in Sidebar */}
        <View style={styles.drawerContainer}>
          {/* Drawer Header */}
          <View style={styles.drawerHeader}>
            <View style={styles.headerTitleArea}>
              <HouzzatProWordmark size="sm" dark={false} />
              <Text style={styles.workspaceName} numberOfLines={1}>
                {brandDisplayName}
              </Text>
              <Text style={styles.orgSubtitle} numberOfLines={1}>
                {orgName}
              </Text>
            </View>

            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Navigation Links Scroll area */}
          <ScrollView
            style={styles.navScrollView}
            contentContainerStyle={styles.navContent}
            showsVerticalScrollIndicator={false}
          >
            {DRAWER_NAV_ITEMS.map((item) => {
              const isActive = activeItemId === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.navItem, isActive && styles.navItemActive]}
                  activeOpacity={0.75}
                  onPress={() => {
                    onSelectItem(item);
                    onClose();
                  }}
                >
                  {isActive && <View style={styles.activeBar} />}
                  <Text style={[styles.navItemIcon, isActive && styles.navItemIconActive]}>
                    {item.icon}
                  </Text>
                  <Text style={[styles.navItemLabel, isActive && styles.navItemLabelActive]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}

            {onSwitchToAgentMode ? (
              <TouchableOpacity
                style={styles.agentModeBtn}
                activeOpacity={0.8}
                onPress={() => {
                  onClose();
                  onSwitchToAgentMode();
                }}
              >
                <Text style={styles.agentModeBtnText}>⇄ Switch to Agent Mode</Text>
              </TouchableOpacity>
            ) : null}

            {hasMultipleWorkspaces ? (
              <TouchableOpacity
                style={styles.switchWsBtn}
                activeOpacity={0.8}
                onPress={() => {
                  onClose();
                  onChangeWorkspace();
                }}
              >
                <Text style={styles.switchWsBtnText}>⇄ Switch Workspace</Text>
              </TouchableOpacity>
            ) : null}
          </ScrollView>

          {/* Drawer Footer with Identity & Logout */}
          <View style={styles.drawerFooter}>
            <View style={styles.userProfileBlock}>
              <Text style={styles.userRoleTag}>{membershipRole}</Text>
              <Text style={styles.userEmailText} numberOfLines={1}>
                {userEmail}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.signOutButton}
              activeOpacity={0.75}
              onPress={handleSignOutPress}
            >
              <Text style={styles.signOutText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const topPadding = Platform.OS === "android" ? Math.max(StatusBar.currentHeight || 0, 42) + 10 : 16;
const bottomPadding = Platform.OS === "android" ? 36 : 16;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "rgba(11, 18, 32, 0.65)",
  },
  backdrop: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  drawerContainer: {
    width: "78%",
    maxWidth: 320,
    height: "100%",
    backgroundColor: "#1E2A38",
    shadowColor: "#000",
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 20,
    justifyContent: "space-between",
    paddingTop: topPadding,
    paddingBottom: bottomPadding,
  },
  drawerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  headerTitleArea: {
    flex: 1,
    gap: 3,
  },
  workspaceName: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
    marginTop: 4,
  },
  orgSubtitle: {
    fontSize: 10,
    fontWeight: "700",
    color: "rgba(255, 255, 255, 0.45)",
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  closeButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  closeIcon: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.8)",
    fontWeight: "bold",
  },
  navScrollView: {
    flex: 1,
  },
  navContent: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    gap: 4,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 8,
    position: "relative",
  },
  navItemActive: {
    backgroundColor: "#0F6B4C", // Canopy green
  },
  activeBar: {
    position: "absolute",
    left: 0,
    top: 6,
    bottom: 6,
    width: 3,
    backgroundColor: "#96F0D8",
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  navItemIcon: {
    fontSize: 16,
    color: "rgba(255, 255, 255, 0.65)",
    width: 26,
    marginRight: 6,
  },
  navItemIconActive: {
    color: "#FFFFFF",
  },
  navItemLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.75)",
  },
  navItemLabelActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  agentModeBtn: {
    marginTop: 12,
    marginHorizontal: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
  },
  agentModeBtnText: {
    color: "#96F0D8",
    fontSize: 12,
    fontWeight: "700",
  },
  switchWsBtn: {
    marginTop: 8,
    marginHorizontal: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    alignItems: "center",
  },
  switchWsBtnText: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 12,
    fontWeight: "600",
  },
  drawerFooter: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingBottom: Platform.OS === "android" ? 36 : 16,
    gap: 10,
  },
  userProfileBlock: {
    gap: 3,
  },
  userRoleTag: {
    fontSize: 10,
    fontWeight: "800",
    color: "#96F0D8",
    letterSpacing: 0.8,
  },
  userEmailText: {
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.55)",
  },
  signOutButton: {
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: "flex-start",
  },
  signOutText: {
    color: "#FCA5A5",
    fontSize: 13,
    fontWeight: "700",
  },
});
