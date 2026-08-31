/**
 * Stage 4.1 & 4.3B — Native Sign In Screen.
 * Connects directly to real Mobile v2 Authentication API:
 * POST /api/mobile/v2/auth/login -> GET /api/mobile/v2/workspaces
 */

import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { HouzzatProMark, HouzzatProWordmark } from "../components/BrandMark";
import { useAuth } from "../state/AuthContext";

export function SignInScreen({ onBack }: { onBack?: () => void }) {
  const { login, isLoading, error } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!email.trim()) {
      setLocalError("Please enter your email address");
      return;
    }
    if (!password) {
      setLocalError("Please enter your password");
      return;
    }
    setLocalError(null);
    await login({
      email: email.trim(),
      password,
    });
  };

  const activeError = localError || error;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#63D9BD" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {onBack ? (
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.backButton} onPress={onBack}>
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Unified Brand + Card Block */}
        <View style={styles.centerBlock}>
          {/* Brand Header */}
          <View style={styles.header}>
            <HouzzatProMark size={84} />
            <View style={styles.wordmarkWrapper}>
              <HouzzatProWordmark size="xl" dark={true} />
            </View>
          </View>

          {/* Sign In Popup / Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Sign in to your account</Text>
            <Text style={styles.cardSubtitle}>Enter your HouzzatPRO staff credentials</Text>

            {activeError ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{activeError}</Text>
              </View>
            ) : null}

            <View style={styles.formGroup}>
              <Text style={styles.label}>Email Address</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  if (localError) setLocalError(null);
                }}
                placeholder="name@brokerage.com"
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                keyboardType="email-address"
                editable={!isLoading}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.passwordWrapper}>
                <TextInput
                  style={styles.passwordInput}
                  value={password}
                  onChangeText={(t) => {
                    setPassword(t);
                    if (localError) setLocalError(null);
                  }}
                  placeholder="••••••••"
                  placeholderTextColor="#94A3B8"
                  secureTextEntry={!showPassword}
                  editable={!isLoading}
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  activeOpacity={0.7}
                  onPress={() => setShowPassword((prev) => !prev)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.eyeIcon}>{showPassword ? "👁" : "👁‍🗨"}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#0B5C49" />
                <Text style={styles.loadingText}>Authenticating with HouzzatPRO…</Text>
              </View>
            ) : (
              <View style={styles.buttonStack}>
                <TouchableOpacity
                  style={styles.signInButton}
                  activeOpacity={0.85}
                  onPress={handleSubmit}
                >
                  <Text style={styles.signInButtonText}>Sign In</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* Footer Notice with generous spacing above Android system bar */}
        <View style={styles.footer}>
          <Text style={styles.footerNotice}>
            Multi-tenant secure platform • API v2.0
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const topPadding = Platform.OS === "android" ? Math.max(StatusBar.currentHeight || 0, 42) + 8 : 20;
const bottomPadding = Platform.OS === "android" ? 56 : 28;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#63D9BD",
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingTop: topPadding,
    paddingBottom: bottomPadding,
    paddingHorizontal: 20,
  },
  topBar: {
    position: "absolute",
    top: topPadding,
    left: 20,
    zIndex: 10,
  },
  backButton: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignSelf: "flex-start",
  },
  backButtonText: {
    color: "#0B5C49",
    fontWeight: "700",
    fontSize: 14,
  },
  centerBlock: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: "auto",
  },
  header: {
    alignItems: "center",
    marginBottom: 16,
  },
  wordmarkWrapper: {
    marginTop: 8,
  },
  card: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1E2A38",
    textAlign: "center",
  },
  cardSubtitle: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    marginTop: 4,
    marginBottom: 20,
  },
  errorBox: {
    backgroundColor: "#FEE2E2",
    borderRadius: 10,
    padding: 10,
    marginBottom: 16,
  },
  errorText: {
    color: "#991B1B",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#1E2A38",
    backgroundColor: "#F8FAFC",
  },
  passwordWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    paddingRight: 12,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#1E2A38",
  },
  eyeButton: {
    padding: 4,
  },
  eyeIcon: {
    fontSize: 18,
    color: "#64748B",
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
  },
  loadingText: {
    fontSize: 14,
    color: "#0B5C49",
    fontWeight: "600",
  },
  buttonStack: {
    marginTop: 8,
  },
  signInButton: {
    backgroundColor: "#0F6B4C",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    shadowColor: "#0F6B4C",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  signInButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  footer: {
    position: "absolute",
    bottom: bottomPadding,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  footerNotice: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0B5C49",
    opacity: 0.9,
    textAlign: "center",
  },
});
