/**
 * Stage 4.1 & 4.3B — Native Sign In Screen.
 * Connects directly to real Mobile v2 Authentication API:
 * POST /api/mobile/v2/auth/login -> GET /api/mobile/v2/workspaces
 */

import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
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
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, () => {
      setKeyboardOpen(true);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardOpen(false);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

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
      // Android: Manifest adjustResize already shrinks the window — competing
      // KAV "height" + scrollToEnd was clipping the form. iOS still needs padding.
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#63D9BD" />
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          keyboardOpen ? styles.scrollContentKeyboardOpen : null,
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {onBack ? (
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.backButton} onPress={onBack}>
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.centerBlock}>
          <View
            style={[styles.header, keyboardOpen && styles.headerCompact]}
          >
            <HouzzatProMark size={keyboardOpen ? 52 : 84} />
            <View style={styles.wordmarkWrapper}>
              <HouzzatProWordmark
                size={keyboardOpen ? "lg" : "xl"}
                dark={true}
              />
            </View>
          </View>

          <View style={[styles.card, keyboardOpen && styles.cardCompact]}>
            <Text style={styles.cardTitle}>Sign in to your account</Text>
            {!keyboardOpen ? (
              <Text style={styles.cardSubtitle}>
                Enter your HouzzatPRO staff credentials
              </Text>
            ) : (
              <View style={styles.subtitleSpacer} />
            )}

            {activeError ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{activeError}</Text>
              </View>
            ) : null}

            <View
              style={[styles.formGroup, keyboardOpen && styles.formGroupCompact]}
            >
              <Text style={styles.label}>Email Address</Text>
              <TextInput
                style={[styles.input, keyboardOpen && styles.inputCompact]}
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  if (localError) setLocalError(null);
                }}
                placeholder="Enter your email address"
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="username"
                keyboardType="email-address"
                importantForAutofill="yes"
                editable={!isLoading}
                returnKeyType="next"
              />
            </View>

            <View
              style={[styles.formGroup, keyboardOpen && styles.formGroupCompact]}
            >
              <Text style={styles.label}>Password</Text>
              <View style={styles.passwordWrapper}>
                <TextInput
                  style={[
                    styles.passwordInput,
                    keyboardOpen && styles.inputCompact,
                  ]}
                  value={password}
                  onChangeText={(t) => {
                    setPassword(t);
                    if (localError) setLocalError(null);
                  }}
                  placeholder="Enter your password"
                  placeholderTextColor="#94A3B8"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  autoComplete="password"
                  textContentType="password"
                  keyboardType={
                    Platform.OS === "android" ? "visible-password" : "default"
                  }
                  importantForAutofill="yes"
                  editable={!isLoading}
                  returnKeyType="go"
                  onSubmitEditing={() => {
                    void handleSubmit();
                  }}
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  activeOpacity={0.7}
                  onPress={() => setShowPassword((prev) => !prev)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.eyeIcon}>
                    {showPassword ? "👁" : "👁‍🗨"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#0B5C49" />
                <Text style={styles.loadingText}>
                  Authenticating with HouzzatPRO…
                </Text>
              </View>
            ) : (
              <View style={styles.buttonStack}>
                <TouchableOpacity
                  style={[
                    styles.signInButton,
                    keyboardOpen && styles.signInButtonCompact,
                  ]}
                  activeOpacity={0.85}
                  onPress={handleSubmit}
                >
                  <Text style={styles.signInButtonText}>Sign In</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {!keyboardOpen ? (
            <Text style={styles.footerNotice}>
              Multi-tenant secure platform • API v2.0
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const topPadding =
  Platform.OS === "android"
    ? Math.max(StatusBar.currentHeight || 0, 42) + 8
    : 20;
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
    paddingBottom: bottomPadding + 40,
    paddingHorizontal: 20,
  },
  // Android adjustResize shrinks the window — keep centering in the remaining
  // space so the form sits in the gap above the keyboard (not pinned to top).
  scrollContentKeyboardOpen: {
    justifyContent: "center",
    paddingTop: Math.max(4, topPadding - 24),
    paddingBottom: 12,
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
  },
  header: {
    alignItems: "center",
    marginBottom: 16,
  },
  headerCompact: {
    marginBottom: 6,
  },
  wordmarkWrapper: {
    marginTop: 6,
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
  cardCompact: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
    borderRadius: 16,
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
  subtitleSpacer: {
    height: 8,
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
  formGroupCompact: {
    marginBottom: 10,
  },
  inputCompact: {
    paddingVertical: 10,
  },
  signInButtonCompact: {
    paddingVertical: 12,
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
  footerNotice: {
    marginTop: 20,
    fontSize: 12,
    fontWeight: "600",
    color: "#0B5C49",
    opacity: 0.9,
    textAlign: "center",
  },
});
