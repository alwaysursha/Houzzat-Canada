/**
 * Stage 5.6 — Address autocomplete for Viewings Planner start locations.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { mobileApiClient } from "../api/client";
import { withQuery } from "../lib/query-string";

export type AddressSuggestion = {
  placeId: string | null;
  label: string;
  subtitle: string | null;
  lat: number | null;
  lng: number | null;
};

export type ResolvedAddress = {
  startAddress: string;
  startLat: number;
  startLng: number;
};

type AddressAutocompleteFieldProps = {
  placeholder?: string;
  onResolved: (address: ResolvedAddress) => void;
  onError?: (message: string) => void;
};

export function AddressAutocompleteField({
  placeholder = "Search for an address…",
  onResolved,
  onError,
}: AddressAutocompleteFieldProps) {
  const [draft, setDraft] = useState("");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    setLoading(true);
    try {
      const endpoint = withQuery("/places/autocomplete", { q: q.trim() });
      const res = await mobileApiClient.get<unknown>(endpoint);
      if (!res.ok) {
        setSuggestions([]);
        return;
      }
      const data = res.data as { suggestions?: AddressSuggestion[] };
      setSuggestions(data.suggestions ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchSuggestions(draft);
    }, 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [draft, fetchSuggestions]);

  const resolveSuggestion = useCallback(
    async (item: AddressSuggestion) => {
      setResolving(true);
      setSuggestions([]);
      setDraft(item.label);
      try {
        if (item.lat != null && item.lng != null) {
          onResolved({
            startAddress: item.subtitle || item.label,
            startLat: item.lat,
            startLng: item.lng,
          });
          return;
        }

        const res = await mobileApiClient.post<unknown>("/places/geocode", {
          placeId: item.placeId ?? undefined,
          query: item.placeId ? undefined : item.label,
        });
        if (!res.ok) {
          onError?.(res.message || "Could not resolve address");
          return;
        }
        const data = res.data as { result?: ResolvedAddress };
        if (data.result) {
          setDraft(data.result.startAddress);
          onResolved(data.result);
        }
      } finally {
        setResolving(false);
      }
    },
    [onResolved, onError],
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.inputRow}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={placeholder}
          placeholderTextColor="#94A3B8"
          style={styles.input}
          autoCapitalize="words"
          autoCorrect={false}
        />
        {loading || resolving ? (
          <View style={styles.spinner}>
            <ActivityIndicator color="#0F766E" />
          </View>
        ) : null}
      </View>

      {suggestions.length > 0 ? (
        <View style={styles.suggestions}>
          {suggestions.slice(0, 6).map((item, index) => (
            <TouchableOpacity
              key={`${item.placeId ?? item.label}-${index}`}
              style={[
                styles.suggestionRow,
                index === suggestions.length - 1 && styles.suggestionRowLast,
              ]}
              onPress={() => void resolveSuggestion(item)}
              activeOpacity={0.75}
            >
              <Text style={styles.suggestionLabel} numberOfLines={2}>
                {item.label}
              </Text>
              {item.subtitle ? (
                <Text style={styles.suggestionSub} numberOfLines={1}>
                  {item.subtitle}
                </Text>
              ) : null}
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 0,
  },
  inputRow: {
    position: "relative",
  },
  input: {
    borderWidth: 1,
    borderColor: "#D8DEE6",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    paddingRight: 40,
    fontSize: 14,
    color: "#1E2A38",
    backgroundColor: "#FFFFFF",
    minHeight: 48,
  },
  spinner: {
    position: "absolute",
    right: 12,
    top: 14,
  },
  suggestions: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  suggestionRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  suggestionRowLast: {
    borderBottomWidth: 0,
  },
  suggestionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1E2A38",
  },
  suggestionSub: {
    marginTop: 2,
    fontSize: 12,
    color: "#64748B",
  },
});
