import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../state/AuthContext";
import { pushAndroidBackHandler } from "../lib/android-back-stack";
import {
  callOutcomeRequestBody,
  pickerWallClockValue,
  postMobileCallOutcome,
} from "../lib/call-outcome-client";
import {
  CALL_OUTCOME_CHOICES,
  FOLLOW_UP_CHOICES,
  callOutcomeAllowsDetails,
  callOutcomeConfirmation,
  formatFollowUpLabel,
  resolveFollowUpInstant,
  type CallOutcomeId,
  type FollowUpChoice,
} from "../../../../src/lib/agent/call-outcome-presentation";

type PickerChange = (event: { type?: string }, date?: Date) => void;
const CallDateTimePicker = DateTimePicker as unknown as (props: {
  value: Date;
  mode: "datetime";
  display?: "spinner";
  onChange: PickerChange;
}) => React.ReactNode;

type CallOutcomeSheetProps = {
  visible: boolean;
  leadId: string;
  customerName: string;
  phoneLabel: string;
  requestId: string;
  onDismiss: () => void;
  onSaved: () => void;
};

export function CallOutcomeSheet({
  visible,
  leadId,
  customerName,
  phoneLabel,
  requestId,
  onDismiss,
  onSaved,
}: CallOutcomeSheetProps) {
  const insets = useSafeAreaInsets();
  const { controller } = useAuth();
  const [outcome, setOutcome] = useState<CallOutcomeId | null>(null);
  const [note, setNote] = useState("");
  const [followUp, setFollowUp] = useState<FollowUpChoice | null>(null);
  const [customDate, setCustomDate] = useState(() => new Date());
  const [showAndroidPicker, setShowAndroidPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || saving) return;
    return pushAndroidBackHandler(() => {
      onDismiss();
      return true;
    });
  }, [visible, saving, onDismiss]);

  const details = outcome ? callOutcomeAllowsDetails(outcome) : false;
  const confirmation = outcome ? callOutcomeConfirmation(outcome) : null;
  const customValue = pickerWallClockValue(customDate);
  const followUpInstant = useMemo(() => {
    if (!details || !followUp) return null;
    return resolveFollowUpInstant(
      followUp,
      new Date(),
      followUp === "custom" ? customValue : undefined,
    );
  }, [customValue, details, followUp]);
  const followUpLabel = followUpInstant ? formatFollowUpLabel(followUpInstant) : null;
  const customIncomplete = details && followUp === "custom" && !followUpInstant;
  const canSave = Boolean(outcome) && !saving && !customIncomplete;

  function dismiss() {
    if (saving) return;
    onDismiss();
  }

  async function save() {
    if (!outcome || saving || customIncomplete) return;
    setSaving(true);
    setError(null);
    let saved = false;
    try {
      const token = await controller.ensureFreshAccessToken();
      if (!token) {
        setError("Couldn't save this call. Try again.");
        return;
      }
      const result = await postMobileCallOutcome({
        token,
        body: callOutcomeRequestBody({
          leadId,
          outcome,
          note,
          followUpDueAt: followUp === "none" ? null : followUpInstant,
          clientRequestId: requestId,
        }),
      });
      if (!result.ok) {
        setError("Couldn't save this call. Try again.");
        return;
      }
      saved = true;
      onSaved();
    } catch {
      setError("Couldn't save this call. Try again.");
    } finally {
      if (!saved) setSaving(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={dismiss}
    >
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          disabled={saving}
          onPress={dismiss}
          accessibilityLabel="Close call outcome"
        />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>How did the call go?</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {customerName}
                {phoneLabel ? ` · ${phoneLabel}` : ""}
              </Text>
            </View>
            <TouchableOpacity onPress={dismiss} disabled={saving} hitSlop={8}>
              <Text style={[styles.close, saving && styles.closeDisabled]}>Close</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.body}
          >
            <View accessibilityRole="radiogroup">
              {CALL_OUTCOME_CHOICES.map((choice) => {
                const selected = outcome === choice.id;
                return (
                  <TouchableOpacity
                    key={choice.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    style={[styles.choice, selected && styles.choiceSelected]}
                    onPress={() => setOutcome(choice.id)}
                    disabled={saving}
                  >
                    <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>
                      {choice.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {confirmation ? <Text style={styles.confirm}>{confirmation}</Text> : null}
            {details ? (
              <>
                <Text style={styles.label}>Notes</Text>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder="Optional"
                  placeholderTextColor="#94A3B8"
                  multiline
                  editable={!saving}
                  style={styles.note}
                />
                <Text style={styles.label}>Next follow-up</Text>
                <View accessibilityRole="radiogroup">
                  {FOLLOW_UP_CHOICES.map((choice) => {
                    const selected = followUp === choice.id;
                    return (
                      <TouchableOpacity
                        key={choice.id}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        style={[styles.choice, selected && styles.choiceSelected]}
                        onPress={() => setFollowUp(choice.id)}
                        disabled={saving}
                      >
                        <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>
                          {choice.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {followUp === "custom" ? (
                  <View style={styles.custom}>
                    {Platform.OS === "ios" ? (
                      <CallDateTimePicker
                        value={customDate}
                        mode="datetime"
                        display="spinner"
                        onChange={(_event, date) => {
                          if (date) setCustomDate(date);
                        }}
                      />
                    ) : (
                      <>
                        <TouchableOpacity
                          style={styles.choice}
                          onPress={() => setShowAndroidPicker(true)}
                          disabled={saving}
                        >
                          <Text style={styles.choiceText}>Choose date and time</Text>
                        </TouchableOpacity>
                        {showAndroidPicker ? (
                          <CallDateTimePicker
                            value={customDate}
                            mode="datetime"
                            onChange={(event, date) => {
                              setShowAndroidPicker(false);
                              if (event.type === "dismissed" || !date) return;
                              setCustomDate(date);
                            }}
                          />
                        ) : null}
                      </>
                    )}
                  </View>
                ) : null}
                {followUpLabel ? <Text style={styles.when}>{`Follow up ${followUpLabel}`}</Text> : null}
              </>
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <TouchableOpacity
              style={[styles.save, !canSave && styles.saveDisabled]}
              onPress={() => {
                void save();
              }}
              disabled={!canSave}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.saveText}>Save Call</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
  },
  sheet: {
    maxHeight: "92%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#CBD5E1",
    marginBottom: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 12,
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1E2A38",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: "#64748B",
  },
  close: {
    fontSize: 15,
    fontWeight: "600",
    color: "#64748B",
    paddingVertical: 4,
  },
  closeDisabled: {
    opacity: 0.4,
  },
  body: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  choice: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    justifyContent: "center",
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  choiceSelected: {
    borderColor: "#0D9488",
    backgroundColor: "#F0FDFA",
  },
  choiceText: {
    fontSize: 16,
    color: "#1E2A38",
    fontWeight: "600",
  },
  choiceTextSelected: {
    color: "#0F766E",
  },
  confirm: {
    fontSize: 14,
    lineHeight: 20,
    color: "#334155",
    marginBottom: 8,
  },
  label: {
    marginTop: 4,
    marginBottom: 6,
    fontSize: 13,
    fontWeight: "700",
    color: "#64748B",
  },
  note: {
    minHeight: 88,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: "#1E2A38",
    textAlignVertical: "top",
    marginBottom: 8,
  },
  custom: {
    marginBottom: 8,
  },
  when: {
    fontSize: 13,
    color: "#0F766E",
    marginBottom: 8,
  },
  error: {
    color: "#B91C1C",
    fontSize: 14,
    marginBottom: 8,
  },
  save: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: "#0D9488",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  saveDisabled: {
    opacity: 0.45,
  },
  saveText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
});
