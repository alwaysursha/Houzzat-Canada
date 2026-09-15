/**
 * TEMPORARY FCM delivery observability — remove after diagnosis.
 * Search Worker logs for `[push:delivery]`.
 *
 * Never logs FCM tokens, service-account credentials, notification
 * title/body, or customer PII.
 */

import type { PushType } from "@/lib/notifications/catalog";

/** Mirrors PushDeliveryStatus — kept local so this file has no import cycle. */
type DeliveryStatus =
  | "sent"
  | "failed"
  | "skipped"
  | "unregistered"
  | "no_device"
  | "pref_off"
  | "disabled";

/** Mirrors FcmFailureCategory — never log raw provider bodies here. */
type DeliveryErrorCategory =
  | "firebase_service_account_missing"
  | "firebase_service_account_invalid"
  | "firebase_project_mismatch"
  | "firebase_oauth_failed"
  | "firebase_private_key_invalid"
  | "fcm_permission_denied"
  | "fcm_api_not_enabled"
  | "fcm_invalid_argument"
  | "fcm_sender_id_mismatch"
  | "fcm_unregistered"
  | "fcm_internal_error"
  | "fcm_unknown"
  | "fcm_stubbed";

export const PUSH_DELIVERY_LOG_PREFIX = "[push:delivery]";

export type PushDeliveryLogStage = "enqueue" | "result";

export type PushDeliveryEnqueueLog = {
  stage: "enqueue";
  type: PushType;
  userIdPrefix: string;
  shell: "houzzat" | "houzzatpro";
};

export type PushDeliveryResultLog = {
  stage: "result";
  type: PushType;
  userIdPrefix: string;
  deviceCount: number;
  shell: "houzzat" | "houzzatpro";
  status: DeliveryStatus;
  httpStatus: number | null;
  errorCategory: DeliveryErrorCategory | null;
  successCount: number;
  failureCount: number;
  firebaseProjectId: string | null;
};

const USER_ID_PREFIX_MAX = 8;

/** First 8 chars of a user id. Empty input → empty prefix. */
export function pushDeliveryUserIdPrefix(userId: string): string {
  return userId.slice(0, USER_ID_PREFIX_MAX);
}

function emit(payload: PushDeliveryEnqueueLog | PushDeliveryResultLog): void {
  console.info(PUSH_DELIVERY_LOG_PREFIX, JSON.stringify(payload));
}

export function logPushDeliveryEnqueue(
  input: Omit<PushDeliveryEnqueueLog, "stage">,
): void {
  emit({
    stage: "enqueue",
    type: input.type,
    userIdPrefix: input.userIdPrefix.slice(0, USER_ID_PREFIX_MAX),
    shell: input.shell,
  });
}

export function logPushDeliveryResult(
  input: Omit<PushDeliveryResultLog, "stage">,
): void {
  emit({
    stage: "result",
    type: input.type,
    userIdPrefix: input.userIdPrefix.slice(0, USER_ID_PREFIX_MAX),
    deviceCount: input.deviceCount,
    shell: input.shell,
    status: input.status,
    httpStatus: input.httpStatus,
    errorCategory: input.errorCategory,
    successCount: input.successCount,
    failureCount: input.failureCount,
    firebaseProjectId: input.firebaseProjectId,
  });
}
