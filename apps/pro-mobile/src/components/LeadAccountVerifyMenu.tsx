/**
 * Native LeadAccountVerifyMenu — web parity (Verified / Unverified Unlocked / Locked).
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { mobileApiClient } from "../api/client";
import {
  accountAccessStatusLabel,
  getAccountAccessStatus,
  type AccountAccessStatus,
} from "../lib/account-access";

function VerifiedBadge({ size = 16 }: { size?: number }) {
  return (
    <View
      style={[
        styles.verifiedBadge,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[styles.verifiedCheck, { fontSize: size * 0.55 }]}>✓</Text>
    </View>
  );
}

function UnlockIcon({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, alignItems: "center" }}>
      <View
        style={{
          width: size * 0.45,
          height: size * 0.28,
          borderWidth: 1.5,
          borderBottomWidth: 0,
          borderColor: color,
          borderTopLeftRadius: size * 0.25,
          borderTopRightRadius: size * 0.25,
          marginTop: 1,
          transform: [{ translateX: -size * 0.08 }],
        }}
      />
      <View
        style={{
          width: size * 0.7,
          height: size * 0.48,
          borderRadius: 2,
          backgroundColor: color,
          marginTop: -1,
        }}
      />
    </View>
  );
}

function LockIcon({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, alignItems: "center" }}>
      <View
        style={{
          width: size * 0.45,
          height: size * 0.28,
          borderWidth: 1.5,
          borderBottomWidth: 0,
          borderColor: color,
          borderTopLeftRadius: size * 0.25,
          borderTopRightRadius: size * 0.25,
          marginTop: 1,
        }}
      />
      <View
        style={{
          width: size * 0.7,
          height: size * 0.48,
          borderRadius: 2,
          backgroundColor: color,
          marginTop: -1,
        }}
      />
    </View>
  );
}

function StatusIcon({
  status,
  size = 16,
}: {
  status: AccountAccessStatus;
  size?: number;
}) {
  switch (status) {
    case "verified_unlocked":
      return <VerifiedBadge size={size} />;
    case "unverified_unlocked":
      return <UnlockIcon color="#CA8A04" size={size} />;
    case "unverified_locked":
      return <LockIcon color="#94A3B8" size={size} />;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function LeadAccountVerifyMenu({
  leadId,
  emailVerified,
  accountCreatedAt,
  compact = false,
  onVerifiedChange,
}: {
  leadId: string;
  emailVerified: boolean;
  accountCreatedAt?: string | null;
  compact?: boolean;
  onVerifiedChange?: (verified: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [localVerified, setLocalVerified] = useState(emailVerified);

  useEffect(() => {
    setLocalVerified(emailVerified);
  }, [emailVerified]);

  const status = useMemo(
    () =>
      getAccountAccessStatus({
        emailVerified: localVerified,
        createdAt: accountCreatedAt ?? null,
      }),
    [localVerified, accountCreatedAt],
  );
  const statusLabel = accountAccessStatusLabel(status);
  const iconSize = compact ? 14 : 16;

  const clearedStatus = useMemo(
    () =>
      getAccountAccessStatus({
        emailVerified: null,
        createdAt: accountCreatedAt ?? null,
      }),
    [accountCreatedAt],
  );

  const setVerified = async (next: boolean) => {
    const nextStatus = getAccountAccessStatus({
      emailVerified: next,
      createdAt: accountCreatedAt ?? null,
    });
    if (pending || nextStatus === status) {
      setOpen(false);
      return;
    }
    setPending(true);
    try {
      const res = await mobileApiClient.post<{
        ok: boolean;
        verified?: boolean;
        message?: string;
      }>(`/leads/${encodeURIComponent(leadId)}/verify-contact`, {
        channel: "email",
        verified: next,
      });
      if (!res.ok) {
        return;
      }
      setLocalVerified(next);
      onVerifiedChange?.(next);
      setOpen(false);
    } finally {
      setPending(false);
    }
  };

  const options: {
    status: AccountAccessStatus;
    verified: boolean;
    hint?: string;
  }[] = [
    { status: "verified_unlocked", verified: true },
    {
      status: "unverified_unlocked",
      verified: false,
      hint: "Within 7-day grace",
    },
    {
      status: "unverified_locked",
      verified: false,
      hint: "Past grace / limited access",
    },
  ];

  return (
    <>
      <TouchableOpacity
        style={[styles.trigger, compact && styles.triggerCompact]}
        onPress={() => setOpen(true)}
        disabled={pending}
        accessibilityLabel={statusLabel}
        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      >
        <StatusIcon status={status} size={iconSize} />
        <Text style={styles.chevron}>▾</Text>
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setOpen(false)}>
          <View style={styles.overlay}>
            <TouchableWithoutFeedback>
              <View style={styles.menu}>
                {options.map((option) => {
                  const selected = option.status === status;
                  const canSelect =
                    option.status === "verified_unlocked" ||
                    (option.verified === false &&
                      clearedStatus === option.status);
                  return (
                    <TouchableOpacity
                      key={option.status}
                      style={[
                        styles.menuItem,
                        selected && styles.menuItemSelected,
                        !canSelect && styles.menuItemDisabled,
                      ]}
                      disabled={pending || !canSelect}
                      onPress={() => {
                        void setVerified(option.verified);
                      }}
                    >
                      <StatusIcon status={option.status} size={16} />
                      <View style={styles.menuTextCol}>
                        <Text style={styles.menuTitle}>
                          {accountAccessStatusLabel(option.status)}
                        </Text>
                        {option.hint ? (
                          <Text style={styles.menuHint}>{option.hint}</Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: 8,
  },
  triggerCompact: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  chevron: {
    fontSize: 10,
    color: "#94A3B8",
    marginTop: 1,
  },
  verifiedBadge: {
    backgroundColor: "#6B9FD4",
    alignItems: "center",
    justifyContent: "center",
  },
  verifiedCheck: {
    color: "#FFFFFF",
    fontWeight: "800",
    lineHeight: 12,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.28)",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  menu: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    overflow: "hidden",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  menuItemSelected: {
    backgroundColor: "#F8FAFC",
  },
  menuItemDisabled: {
    opacity: 0.45,
  },
  menuTextCol: {
    flex: 1,
    minWidth: 0,
  },
  menuTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0F172A",
  },
  menuHint: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "500",
    color: "#94A3B8",
  },
});
