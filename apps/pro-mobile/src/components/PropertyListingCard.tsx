/**
 * Stage 5.3 / 5.4 / 5.5 — Shared native property result card (Houzzat consumer parity).
 */

import React, { memo } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import {
  formatListingAddress,
  formatListingBeds,
  formatListingPrice,
} from "../lib/property-response";
import type { MobileListingCard } from "../types/property";
import { ShortlistButton } from "./ShortlistButton";

export const LISTING_IMAGE_LIMIT = 12;

export const PropertyListingCard = memo(function PropertyListingCard({
  listing,
  isSelected,
  showImage,
  isSaved,
  shortlistPending,
  onOpen,
  onToggleSelect,
  onToggleShortlist,
}: {
  listing: MobileListingCard;
  isSelected: boolean;
  showImage: boolean;
  isSaved: boolean;
  shortlistPending: boolean;
  onOpen: (listing: MobileListingCard) => void;
  onToggleSelect: (mls: string) => void;
  onToggleShortlist: (mls: string) => void;
}) {
  const timing = listing.timingLabel?.trim();

  if (!showImage) {
    return (
      <TouchableOpacity
        style={[styles.cardCompact, isSelected && styles.cardSelected]}
        onPress={() => onOpen(listing)}
        activeOpacity={0.85}
      >
        <TouchableOpacity
          style={[styles.checkBadgeInline, isSelected && styles.checkBadgeOn]}
          onPress={() => onToggleSelect(listing.mlsNumber)}
          activeOpacity={0.85}
        >
          <Text style={[styles.checkBadgeText, isSelected && styles.checkBadgeTextOn]}>
            {isSelected ? "✓" : ""}
          </Text>
        </TouchableOpacity>
        <View style={styles.cardCompactBody}>
          <Text style={styles.cardAddress} numberOfLines={1}>
            {formatListingAddress(listing)}
          </Text>
          <Text style={styles.cardPrice}>
            {formatListingPrice(listing.listPrice, listing.transactionType)}
          </Text>
          <Text style={styles.cardMeta}>
            {formatListingBeds(listing)} bed · {listing.baths} bath · MLS{" "}
            {listing.mlsNumber}
          </Text>
          {timing ? <Text style={styles.cardTiming}>{timing}</Text> : null}
        </View>
        <ShortlistButton
          saved={isSaved}
          pending={shortlistPending}
          compact
          onPress={() => onToggleShortlist(listing.mlsNumber)}
        />
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.card, isSelected && styles.cardSelected]}
      onPress={() => onOpen(listing)}
      activeOpacity={0.85}
    >
      <View style={styles.cardImageWrap}>
        {listing.primaryImageUrl ? (
          <Image
            source={{ uri: listing.primaryImageUrl }}
            style={styles.cardImage}
            resizeMode="cover"
            fadeDuration={0}
          />
        ) : (
          <View style={styles.cardImagePlaceholder}>
            <Text style={styles.cardImagePlaceholderText}>No photo</Text>
          </View>
        )}
        <TouchableOpacity
          style={[styles.checkBadge, isSelected && styles.checkBadgeOn]}
          onPress={() => onToggleSelect(listing.mlsNumber)}
          activeOpacity={0.85}
        >
          <Text style={[styles.checkBadgeText, isSelected && styles.checkBadgeTextOn]}>
            {isSelected ? "✓" : ""}
          </Text>
        </TouchableOpacity>
        <View style={styles.shortlistOverlay}>
          <ShortlistButton
            saved={isSaved}
            pending={shortlistPending}
            compact
            onPress={() => onToggleShortlist(listing.mlsNumber)}
          />
        </View>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardAddress} numberOfLines={2}>
          {formatListingAddress(listing)}
        </Text>
        <Text style={styles.cardPrice}>
          {formatListingPrice(listing.listPrice, listing.transactionType)}
        </Text>
        <Text style={styles.cardMeta}>
          {formatListingBeds(listing)} bed · {listing.baths} bath · MLS{" "}
          {listing.mlsNumber}
        </Text>
        {timing ? <Text style={styles.cardTiming}>{timing}</Text> : null}
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 10,
    marginBottom: 10,
  },
  cardCompact: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
    marginBottom: 8,
  },
  cardCompactBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  cardSelected: {
    borderColor: "#2B6CB0",
    backgroundColor: "#EFF6FF",
  },
  cardImageWrap: {
    width: 84,
    height: 84,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#EEF2F6",
    position: "relative",
  },
  cardImage: {
    width: "100%",
    height: "100%",
  },
  cardImagePlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cardImagePlaceholderText: {
    fontSize: 10,
    color: "#94A3B8",
    fontWeight: "600",
  },
  checkBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  checkBadgeInline: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 2,
  },
  checkBadgeOn: {
    borderColor: "#2B6CB0",
    backgroundColor: "#2B6CB0",
  },
  checkBadgeText: {
    fontSize: 12,
    fontWeight: "800",
    color: "transparent",
  },
  checkBadgeTextOn: {
    color: "#FFFFFF",
  },
  shortlistOverlay: {
    position: "absolute",
    bottom: 6,
    right: 6,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: 2,
  },
  cardAddress: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E2A38",
  },
  cardPrice: {
    fontSize: 14,
    fontWeight: "800",
    color: "#2B6CB0",
  },
  cardMeta: {
    fontSize: 11,
    color: "#64748B",
  },
  cardTiming: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "600",
    marginTop: 2,
  },
});
