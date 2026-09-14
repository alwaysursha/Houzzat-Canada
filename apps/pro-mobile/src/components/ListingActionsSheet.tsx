/**
 * Listing detail action sheet — Email / Text / WhatsApp / Copy link / Add to viewing.
 *
 * Intentionally NOT a nested RN <Modal>. Nesting Modal inside PropertyDetailModal's
 * Modal leaves an Android Dialog host that eats taps after hardware back (scroll
 * still works; TouchableOpacity / shortlist freeze).
 */

import React, { useCallback, useState } from "react";
import {
  Alert,
  Clipboard,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  buildListingShareMessage,
  type ListingShareChannel,
  type ListingShareInput,
} from "../lib/listing-share";

type ListingActionsSheetProps = {
  visible: boolean;
  listing: ListingShareInput | null;
  showAddToViewing: boolean;
  onClose: () => void;
  onAddToViewing?: () => void;
};

const SHARE_ROWS: { channel: ListingShareChannel; label: string }[] = [
  { channel: "email", label: "Email listing" },
  { channel: "sms", label: "Text listing" },
  { channel: "whatsapp", label: "WhatsApp" },
  { channel: "copy_link", label: "Copy link" },
];

export function ListingActionsSheet({
  visible,
  listing,
  showAddToViewing,
  onClose,
  onAddToViewing,
}: ListingActionsSheetProps) {
  const [busy, setBusy] = useState(false);

  const handleShare = useCallback(
    async (channel: ListingShareChannel) => {
      if (!listing || busy) return;
      const payload = buildListingShareMessage(listing);
      setBusy(true);
      try {
        switch (channel) {
          case "email": {
            const subject = encodeURIComponent(payload.subject);
            const body = encodeURIComponent(payload.body);
            await Linking.openURL(`mailto:?subject=${subject}&body=${body}`);
            break;
          }
          case "sms": {
            const body = encodeURIComponent(payload.body);
            await Linking.openURL(`sms:?body=${body}`);
            break;
          }
          case "whatsapp": {
            const text = encodeURIComponent(payload.body);
            await Linking.openURL(`https://wa.me/?text=${text}`);
            break;
          }
          case "copy_link":
            Clipboard.setString(payload.url);
            Alert.alert("Link copied", "Listing link copied to clipboard.");
            break;
          default: {
            const _exhaustive: never = channel;
            return _exhaustive;
          }
        }
        onClose();
      } catch {
        Alert.alert("Share failed", "Could not open that share option.");
      } finally {
        setBusy(false);
      }
    },
    [listing, busy, onClose],
  );

  const handleAddToViewing = useCallback(() => {
    if (!onAddToViewing || busy) return;
    onClose();
    onAddToViewing();
  }, [onAddToViewing, busy, onClose]);

  if (!visible) return null;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>Listing actions</Text>

        {SHARE_ROWS.map((row) => (
          <TouchableOpacity
            key={row.channel}
            style={styles.option}
            activeOpacity={0.75}
            disabled={busy || !listing}
            onPress={() => void handleShare(row.channel)}
          >
            <Text style={styles.optionText}>{row.label}</Text>
          </TouchableOpacity>
        ))}

        {showAddToViewing && onAddToViewing ? (
          <TouchableOpacity
            style={styles.option}
            activeOpacity={0.75}
            disabled={busy}
            onPress={handleAddToViewing}
          >
            <Text style={styles.optionText}>Add to viewing</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={styles.cancel}
          onPress={onClose}
          activeOpacity={0.75}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    zIndex: 40,
    elevation: 40,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 28,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#CBD5E1",
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1E2A38",
    marginBottom: 4,
  },
  option: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  optionText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1E2A38",
  },
  cancel: {
    marginTop: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#64748B",
  },
});
