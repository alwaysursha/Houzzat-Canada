/**
 * Android notification channel for Houzzat consumer heads-up alerts.
 * Importance is sticky after first create — changing code alone will not
 * upgrade an existing lower-importance channel with the same id.
 */

/** FCM `android.notification.channel_id` + Capacitor createChannel id. */
export const HOUZZAT_UPDATES_CHANNEL_ID = "houzzat_updates";

export const HOUZZAT_UPDATES_CHANNEL_NAME = "Property updates";

export const HOUZZAT_UPDATES_CHANNEL_DESCRIPTION =
  "Price drops, saved-search matches, and listing updates";

/** Android NotificationManager.IMPORTANCE_HIGH — enables heads-up banners. */
export const HOUZZAT_UPDATES_CHANNEL_IMPORTANCE = 4 as const;

/** NotificationCompat.VISIBILITY_PUBLIC */
export const HOUZZAT_UPDATES_CHANNEL_VISIBILITY = 1 as const;
