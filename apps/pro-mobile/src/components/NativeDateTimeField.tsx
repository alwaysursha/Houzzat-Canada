/**
 * Native date/time picker field (calendar on Android, spinner on iOS).
 */

import React, { useState } from "react";
import {
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";

const DateTimePickerNative =
  DateTimePicker as unknown as React.ComponentType<{
    value: Date;
    mode: "date" | "time";
    display?: "default" | "spinner" | "calendar" | "clock";
    onChange: (event: DateTimePickerEvent, date?: Date) => void;
    style?: object;
  }>;

type NativeDateTimeFieldProps = {
  label: string;
  value: Date | null;
  mode: "date" | "time";
  onChange: (date: Date | null) => void;
  placeholder?: string;
};

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-CA", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function NativeDateTimeField({
  label,
  value,
  mode,
  onChange,
  placeholder,
}: NativeDateTimeFieldProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(value ?? new Date());

  const display =
    value != null
      ? mode === "date"
        ? formatDate(value)
        : formatTime(value)
      : placeholder ?? (mode === "date" ? "Select date" : "Select time");

  const onPickerChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === "android") {
      setOpen(false);
      if (event.type === "dismissed") return;
      if (selected) onChange(selected);
      return;
    }
    if (selected) setDraft(selected);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        style={styles.field}
        onPress={() => {
          setDraft(value ?? new Date());
          setOpen(true);
        }}
        activeOpacity={0.8}
      >
        <Text style={[styles.value, !value && styles.placeholder]}>{display}</Text>
        <Text style={styles.chevron}>{mode === "date" ? "📅" : "🕐"}</Text>
      </TouchableOpacity>

      {Platform.OS === "android" && open ? (
        <DateTimePickerNative
          value={draft}
          mode={mode}
          display="default"
          onChange={onPickerChange}
        />
      ) : null}

      {Platform.OS === "ios" ? (
        <Modal visible={open} transparent animationType="slide">
          <View style={styles.modalBackdrop}>
            <View style={styles.modalSheet}>
              <View style={styles.modalBar}>
                <TouchableOpacity onPress={() => setOpen(false)}>
                  <Text style={styles.modalCancel}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.modalTitle}>{label}</Text>
                <TouchableOpacity
                  onPress={() => {
                    onChange(draft);
                    setOpen(false);
                  }}
                >
                  <Text style={styles.modalDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePickerNative
                value={draft}
                mode={mode}
                display="spinner"
                onChange={onPickerChange}
                style={styles.iosPicker}
              />
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 2,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#D8DEE6",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: "#FFFFFF",
    minHeight: 48,
  },
  value: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: "#1E2A38",
  },
  placeholder: {
    color: "#94A3B8",
    fontWeight: "500",
  },
  chevron: {
    fontSize: 18,
    marginLeft: 8,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 23, 42, 0.4)",
  },
  modalSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
  },
  modalBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1E2A38",
  },
  modalCancel: {
    fontSize: 15,
    color: "#64748B",
    fontWeight: "600",
  },
  modalDone: {
    fontSize: 15,
    color: "#0F766E",
    fontWeight: "700",
  },
  iosPicker: {
    height: 220,
  },
});
