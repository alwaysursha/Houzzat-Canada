export const MLS_HEALTH_SIGNALS = [
  "fast_silent",
  "full_silent",
  "full_stuck",
  "pipeline_silent",
  "cursor_lag",
  "transport_degraded",
  "typesense_degraded",
  "credentials",
  "reconcile_discovery",
  "reconcile_rotation",
  "reconcile_typesense_retry",
  "reconcile_stopped",
  "media_zero_photos",
  "media_failures",
  "media_stalled",
] as const;

export type MlsHealthSignal = (typeof MLS_HEALTH_SIGNALS)[number];

export type MlsHealthSeverity = "warning" | "critical";

export type MlsHealthDetailValue = string | number | boolean | null;

export type MlsHealthFinding = {
  signal: MlsHealthSignal;
  severity: MlsHealthSeverity;
  summary: string;
  detail: Record<string, MlsHealthDetailValue>;
};

export type MlsHealthReconcile = {
  discoveryComplete: boolean;
  rotationBudget: number;
};

/**
 * One MLS run reduced to the fields the evaluator needs.
 * Error text is used only to classify credentials, then dropped.
 */
export type MlsHealthRun = {
  id: string;
  resource: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  pages: number;
  proptxRetriesExhausted: number;
  proptx429: number;
  proptx5xx: number;
  proptxTimeouts: number;
  proptxNetworkErrors: number;
  typesenseFailed: number;
  mediaFetches: number;
  mediaErrorCount: number;
  onMarketReconcile: MlsHealthReconcile | null;
  credentialReason: "http_401" | "http_403" | "credentials" | null;
};

export type MlsHealthSampleState = {
  zeroPhotoBaseline: number | null;
  zeroPhotoElevatedStreak: number;
  reconcileRetryCount: number | null;
  reconcileRetryHighSince: string | null;
};

export type MlsHealthSnapshot = {
  now: string;
  runs: MlsHealthRun[];
  propertyCursor: { cursor: string | null; updatedAt: string | null };
  maxUpdatedAtMls: string | null;
  discoverCursorUpdatedAt: string | null;
  rotateCursorUpdatedAt: string | null;
  typesenseRetryCount: number;
  activeZeroPhotos: number;
  sample: MlsHealthSampleState;
};

export type MlsHealthSampleUpdate = {
  activeZeroPhotos: number;
  zeroPhotoBaseline: number;
  zeroPhotoElevatedStreak: number;
  reconcileRetryCount: number;
  reconcileRetryHighSince: string | null;
};

export type MlsHealthEvaluation = {
  findings: MlsHealthFinding[];
  sample: MlsHealthSampleUpdate;
};

export type StoredMlsHealthIncident = {
  signal: MlsHealthSignal;
  severity: MlsHealthSeverity;
  state: "open" | "recovered";
  openedAt: string;
  recoveredAt: string | null;
  lastObservedAt: string;
  notifiedAt: string | null;
  reminded: boolean;
  summary: string;
  detail: Record<string, MlsHealthDetailValue>;
};

export type MlsHealthAlertKind = "opened" | "escalated" | "reminder" | "recovered";

export type MlsHealthAlertLine = {
  signal: MlsHealthSignal;
  severity: MlsHealthSeverity;
  summary: string;
};

export type MlsHealthAlert = {
  kind: MlsHealthAlertKind;
  severity: MlsHealthSeverity;
  lines: MlsHealthAlertLine[];
};
