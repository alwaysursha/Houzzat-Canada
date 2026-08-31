/**
 * Stage 4.0 — HouzzatPRO Mobile v2 Entry Point.
 */

import React from "react";
import { StatusBar, StyleSheet, View } from "react-native";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { AuthProvider } from "./src/state/AuthContext";

export default function App() {
  return (
    <AuthProvider>
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#1E2A38" />
        <RootNavigator />
      </View>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#63D9BD",
  },
});
