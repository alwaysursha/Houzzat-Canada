/**
 * Stage 4.1 — Native Sign In Screen.
 * Connects directly to real Mobile v2 Authentication API:
 * POST /api/mobile/v2/auth/login -> GET /api/mobile/v2/workspaces
 */

import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { HouzzatProMark, HouzzatProWordmark } from "../components/BrandMark";
import { useAuth } from "../state/AuthContext";

export function SignInScreen({ onBack }: { onBack: () => void }) {
  const { login, isLoading, error } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <HouzzatProMark size={56} />
        <View style={styles.wordmarkWrapper}>
          <HouzzatProWordmark size="md" dark={true} />
        </View>
      </View>

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
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              if (localError) setLocalError(null);
            }}
            placeholder="••••••••"
            placeholderTextColor="#94A3B8"
            secureTextEntry={true}
            editable={!isLoading}
          />
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

      <View style={styles.footer}>
        <Text style={styles.footerNotice}>
          Multi-tenant secure platform • API v2.0
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#63D9BD",
    justifyContent: "space-between",
    paddingVertical: 48,
    paddingHorizontal: 20,
  },
  header: {
    alignItems: "center",
    position: "relative",
  },
  backButton: {
    position: "absolute",
    left: 0,
    top: 4,
    padding: 8,
  },
  backButtonText: {
    color: "#0B5C49",
    fontWeight: "700",
    fontSize: 14,
  },
  wordmarkWrapper: {
    marginTop: 10,
  },
  card: {
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
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0B5C49",
  },
  buttonStack: {
    marginTop: 8,
  },
  signInButton: {
    backgroundColor: "#0B5C49",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  signInButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  footer: {
    alignItems: "center",
  },
  footerNotice: {
    fontSize: 11,
    fontWeight: "500",
    color: "#0B5C49",
    opacity: 0.7,
  },
});
