/**
 * Android notification channels for Houzzat (consumer) and HouzzatPro (staff).
 * Importance is sticky after first create — changing code alone will not
 * upgrade an existing lower-importance channel with the same id.
 */

/** Consumer FCM `android.notification.channel_id` + Capacitor createChannel id. */
export const HOUZZAT_UPDATES_CHANNEL_ID = "houzzat_updates";

export const HOUZZAT_UPDATES_CHANNEL_NAME = "Property updates";

export const HOUZZAT_UPDATES_CHANNEL_DESCRIPTION =
  "Price drops, saved-search matches, and listing updates";

/** Android NotificationManager.IMPORTANCE_HIGH — enables heads-up banners. */
export const HOUZZAT_UPDATES_CHANNEL_IMPORTANCE = 4 as const;

/** NotificationCompat.VISIBILITY_PUBLIC — consumer listing alerts are OK public. */
export const HOUZZAT_UPDATES_CHANNEL_VISIBILITY = 1 as const;

/**
 * HouzzatPro staff alerts — separate package + separate channel id.
 * Do not reuse `houzzat_updates` (consumer naming / product semantics).
 */
export const HOUZZAT_PRO_ALERTS_CHANNEL_ID = "houzzat_pro_alerts";

export const HOUZZAT_PRO_ALERTS_CHANNEL_NAME = "HouzzatPro alerts";

export const HOUZZAT_PRO_ALERTS_CHANNEL_DESCRIPTION =
  "New leads, tasks, appointments, and CRM desk alerts";

export const HOUZZAT_PRO_ALERTS_CHANNEL_IMPORTANCE = 4 as const;

/**
 * NotificationCompat.VISIBILITY_PRIVATE — CRM bodies may include customer
 * names/addresses; keep full content off the secure lock screen.
 */
export const HOUZZAT_PRO_ALERTS_CHANNEL_VISIBILITY = 0 as const;
