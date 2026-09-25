/**
 * Stage 4.0 — HouzzatPRO Mobile v2 Entry Point.
 * Phase 1 — SafeAreaProvider + NavigationContainer foundation.
 */

import React from "react";
import { StatusBar, StyleSheet, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { enableScreens } from "react-native-screens";
import { PushRegistrationBootstrap } from "./src/components/PushRegistrationBootstrap";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { AuthProvider } from "./src/state/AuthContext";
import "./src/storage/hardware-secure-storage";

enableScreens(true);

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <View style={styles.container}>
          <StatusBar barStyle="light-content" backgroundColor="#1E2A38" />
          <PushRegistrationBootstrap />
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
        </View>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#63D9BD",
  },
});
