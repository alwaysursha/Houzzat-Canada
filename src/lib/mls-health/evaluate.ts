import type {
  MlsHealthEvaluation,
  MlsHealthFinding,
  MlsHealthRun,
  MlsHealthSampleUpdate,
  MlsHealthSeverity,
  MlsHealthSignal,
  MlsHealthSnapshot,
} from "@/lib/mls-health/types";

const HOUR = 60 * 60 * 1000;

export const MLS_HEALTH_FRESH_RUNNING_MS = 3 * HOUR;
export const MLS_HEALTH_FAST_SUPPRESS_AFTER_FULL_MS = 20 * 60 * 1000;
export const MLS_HEALTH_FAST_WARNING_MS = 30 * 60 * 1000;
export const MLS_HEALTH_FAST_CRITICAL_MS = 90 * 60 * 1000;
export const MLS_HEALTH_FULL_WARNING_MS = 3.5 * HOUR;
export const MLS_HEALTH_FULL_CRITICAL_MS = 6 * HOUR;
export const MLS_HEALTH_CURSOR_TOUCH_MS = 4 * HOUR;
export const MLS_HEALTH_CURSOR_WARNING_MS = 12 * HOUR;
export const MLS_HEALTH_CURSOR_CRITICAL_MS = 36 * HOUR;
export const MLS_HEALTH_RECONCILE_SEEN_MS = 7 * 24 * HOUR;
export const MLS_HEALTH_RECONCILE_RECENT_MS = 24 * HOUR;
export const MLS_HEALTH_DISCOVER_WARNING_MS = 24 * HOUR;
export const MLS_HEALTH_DISCOVER_CRITICAL_MS = 48 * HOUR;
export const MLS_HEALTH_ROTATE_WARNING_MS = 24 * HOUR;
export const MLS_HEALTH_ROTATE_CRITICAL_MS = 48 * HOUR;
export const MLS_HEALTH_RETRY_WARNING_COUNT = 10;
export const MLS_HEALTH_RETRY_CRITICAL_COUNT = 25;
export const MLS_HEALTH_MEDIA_WARNING_DELTA = 25;
export const MLS_HEALTH_MEDIA_CRITICAL_DELTA = 100;
export const MLS_HEALTH_MEDIA_CRITICAL_ABSOLUTE = 250;

function at(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const value = Date.parse(iso);
  return Number.isNaN(value) ? null : value;
}

function age(now: number, iso: string | null | undefined): number | null {
  const value = at(iso);
  if (value == null) return null;
  return now - value;
}

function finding(
  signal: MlsHealthSignal,
  severity: MlsHealthSeverity,
  summary: string,
  detail: MlsHealthFinding["detail"] = {},
): MlsHealthFinding {
  return { signal, severity, summary, detail };
}

function isFinished(run: MlsHealthRun): boolean {
  return run.status !== "running" && at(run.finishedAt) != null;
}

function isFullPropertySuccess(run: MlsHealthRun): boolean {
  return (
    run.resource === "all" &&
    isFinished(run) &&
    (run.status === "ok" || run.status === "degraded") &&
    run.pages > 0
  );
}

function byFinishedDesc(runs: MlsHealthRun[]): MlsHealthRun[] {
  return [...runs].sort(
    (a, b) => (at(b.finishedAt) ?? 0) - (at(a.finishedAt) ?? 0),
  );
}

function newest(runs: MlsHealthRun[]): MlsHealthRun | null {
  return byFinishedDesc(runs)[0] ?? null;
}

function pipelineRuns(runs: MlsHealthRun[]): MlsHealthRun[] {
  return runs.filter((run) => run.resource === "fast" || run.resource === "all");
}

/**
 * Classify a snapshot. No database, no email, no PropTx.
 * A Full success is a finished Property run (`resource = "all"`, pages > 0).
 */
export function evaluateMlsHealth(snapshot: MlsHealthSnapshot): MlsHealthEvaluation {
  const now = at(snapshot.now);
  if (now == null) {
    throw new Error("MLS health snapshot is missing a valid now timestamp");
  }

  const findings: MlsHealthFinding[] = [];
  const runs = snapshot.runs;
  const freshRunning = runs.some((run) => {
    if (run.status !== "running") return false;
    if (run.resource !== "fast" && run.resource !== "all") return false;
    const started = age(now, run.startedAt);
    return started != null && started < MLS_HEALTH_FRESH_RUNNING_MS;
  });
  const stuckFull = runs.find((run) => {
    if (run.status !== "running" || run.resource !== "all") return false;
    const started = age(now, run.startedAt);
    return started != null && started >= MLS_HEALTH_FRESH_RUNNING_MS;
  });

  const lastFast = newest(
    runs.filter(
      (run) =>
        run.resource === "fast" &&
        isFinished(run) &&
        (run.status === "ok" || run.status === "degraded"),
    ),
  );
  const fastAge = lastFast ? age(now, lastFast.finishedAt) : Number.POSITIVE_INFINITY;
  const lastFull = newest(runs.filter(isFullPropertySuccess));
  const fullAge = lastFull ? age(now, lastFull.finishedAt) : Number.POSITIVE_INFINITY;
  const suppressFast =
    freshRunning ||
    (fullAge != null && fullAge <= MLS_HEALTH_FAST_SUPPRESS_AFTER_FULL_MS);

  let fastFinding: MlsHealthFinding | null = null;
  if (!suppressFast && fastAge != null && fastAge >= MLS_HEALTH_FAST_WARNING_MS) {
    const critical = fastAge >= MLS_HEALTH_FAST_CRITICAL_MS;
    fastFinding = finding(
      "fast_silent",
      critical ? "critical" : "warning",
      critical
        ? "Fast sync has not finished successfully in 90 minutes."
        : "Fast sync has not finished successfully in 30 minutes.",
      { lastFastFinishedAt: lastFast?.finishedAt ?? null },
    );
  }

  const freshFullRunning = runs.some((run) => {
    if (run.status !== "running" || run.resource !== "all") return false;
    const started = age(now, run.startedAt);
    return started != null && started < MLS_HEALTH_FRESH_RUNNING_MS;
  });
  let fullSilent: MlsHealthFinding | null = null;
  if (
    !freshFullRunning &&
    fullAge != null &&
    fullAge >= MLS_HEALTH_FULL_WARNING_MS
  ) {
    const critical = fullAge >= MLS_HEALTH_FULL_CRITICAL_MS;
    fullSilent = finding(
      "full_silent",
      critical ? "critical" : "warning",
      critical
        ? "Full sync has not finished a Property run in 6 hours."
        : "Full sync has not finished a Property run in 3.5 hours.",
      { lastFullFinishedAt: lastFull?.finishedAt ?? null },
    );
  }

  const fullStuck = stuckFull
    ? finding(
        "full_stuck",
        "critical",
        "A Full sync run has been in progress for over 3 hours.",
        { startedAt: stuckFull.startedAt },
      )
    : null;

  const fastCritical = fastFinding?.severity === "critical";
  const fullSilenceCritical = fullSilent?.severity === "critical";
  if (fastCritical && fullSilenceCritical && !freshRunning) {
    findings.push(
      finding(
        "pipeline_silent",
        "critical",
        stuckFull
          ? "The Sync Mac MLS pipeline is silent, and a Full run has been in progress for over 3 hours."
          : "The Sync Mac MLS pipeline is silent. Fast and Full have both stopped, and no fresh run is in progress.",
        {
          lastFastFinishedAt: lastFast?.finishedAt ?? null,
          lastFullFinishedAt: lastFull?.finishedAt ?? null,
          fullStuck: Boolean(stuckFull),
        },
      ),
    );
  } else {
    if (fastFinding) findings.push(fastFinding);
    if (fullSilent) findings.push(fullSilent);
    if (fullStuck) findings.push(fullStuck);
  }

  pushCursor(findings, snapshot, now);
  pushTransport(findings, runs);
  pushTypesense(findings, runs);
  pushCredentials(findings, runs);
  const reconcileMode = pushReconcile(findings, snapshot, now);
  const sample = pushMedia(findings, snapshot, reconcileMode);
  return { findings, sample };
}

function pushCursor(
  findings: MlsHealthFinding[],
  snapshot: MlsHealthSnapshot,
  now: number,
): void {
  const touched = age(now, snapshot.propertyCursor.updatedAt);
  if (touched == null || touched > MLS_HEALTH_CURSOR_TOUCH_MS) return;
  const cursorAt = at(snapshot.propertyCursor.cursor);
  const newestMls = at(snapshot.maxUpdatedAtMls);
  if (cursorAt == null || newestMls == null) return;
  const gap = newestMls - cursorAt;
  if (gap <= MLS_HEALTH_CURSOR_WARNING_MS) return;
  const critical = gap > MLS_HEALTH_CURSOR_CRITICAL_MS;
  findings.push(
    finding(
      "cursor_lag",
      critical ? "critical" : "warning",
      critical
        ? "The Property cursor is more than 36 hours behind the newest stored MLS modification."
        : "The Property cursor is more than 12 hours behind the newest stored MLS modification.",
      { gapHours: Math.round(gap / HOUR) },
    ),
  );
}

function pushTransport(findings: MlsHealthFinding[], runs: MlsHealthRun[]): void {
  const recent = byFinishedDesc(pipelineRuns(runs).filter(isFinished)).slice(0, 6);
  if (recent.length === 0) return;
  const exhausted = recent.reduce((sum, run) => sum + run.proptxRetriesExhausted, 0);
  const rateLimited = recent.reduce((sum, run) => sum + run.proptx429, 0);
  const serverErrors = recent.reduce((sum, run) => sum + run.proptx5xx, 0);
  const timeouts = recent.reduce((sum, run) => sum + run.proptxTimeouts, 0);
  const networkErrors = recent.reduce((sum, run) => sum + run.proptxNetworkErrors, 0);
  const transportErrors = serverErrors + timeouts + networkErrors;
  const consecutiveErrors =
    recent.length >= 3 && recent.slice(0, 3).every((run) => run.status === "error");
  const detail = { exhausted, rateLimited, serverErrors, timeouts, networkErrors };
  if (exhausted >= 8 || consecutiveErrors) {
    findings.push(
      finding(
        "transport_degraded",
        "critical",
        consecutiveErrors
          ? "The last three Fast or Full runs failed."
          : "PropTx retries were exhausted across recent MLS runs.",
        detail,
      ),
    );
    return;
  }
  if (exhausted >= 3 || rateLimited >= 20 || transportErrors >= 20) {
    findings.push(
      finding(
        "transport_degraded",
        "warning",
        "Recent MLS runs are seeing repeated PropTx rate limits, server errors, or exhausted retries.",
        detail,
      ),
    );
  }
}

function pushTypesense(findings: MlsHealthFinding[], runs: MlsHealthRun[]): void {
  const recent = byFinishedDesc(pipelineRuns(runs).filter(isFinished));
  const newestRun = recent[0];
  if (!newestRun) return;
  const last3 = recent.slice(0, 3);
  const consecutive =
    last3.length === 3 &&
    last3.every((run) => run.status === "degraded" || run.typesenseFailed > 0);
  if (consecutive) {
    findings.push(
      finding(
        "typesense_degraded",
        "critical",
        "Typesense writes have failed on three consecutive MLS runs.",
        { typesenseFailed: last3.reduce((sum, run) => sum + run.typesenseFailed, 0) },
      ),
    );
    return;
  }
  if (newestRun.status === "degraded") {
    findings.push(
      finding(
        "typesense_degraded",
        "warning",
        "The newest MLS run finished with Typesense degraded.",
        { typesenseFailed: newestRun.typesenseFailed },
      ),
    );
  }
}

function pushCredentials(findings: MlsHealthFinding[], runs: MlsHealthRun[]): void {
  const newestRun = newest(pipelineRuns(runs).filter(isFinished));
  if (!newestRun || newestRun.status !== "error" || !newestRun.credentialReason) return;
  findings.push(
    finding(
      "credentials",
      "critical",
      "The latest MLS run failed with an authentication or credential error.",
      { reason: newestRun.credentialReason },
    ),
  );
}

function pushReconcile(
  findings: MlsHealthFinding[],
  snapshot: MlsHealthSnapshot,
  now: number,
): "off" | "stopped" | "active" {
  const fullRuns = byFinishedDesc(
    snapshot.runs.filter((run) => run.resource === "all" && isFinished(run) && run.pages > 0),
  );
  const seen = fullRuns.filter((run) => {
    const started = age(now, run.startedAt);
    return run.onMarketReconcile != null && started != null && started <= MLS_HEALTH_RECONCILE_SEEN_MS;
  });
  if (seen.length === 0) return "off";
  const recent = seen.filter((run) => {
    const finished = age(now, run.finishedAt);
    return finished != null && finished <= MLS_HEALTH_RECONCILE_RECENT_MS;
  });
  if (recent.length === 0) {
    findings.push(
      finding(
        "reconcile_stopped",
        "warning",
        "Off-market reconciliation ran in the last week and has not appeared on a Full run in 24 hours.",
      ),
    );
    return "stopped";
  }

  const last3 = fullRuns.slice(0, 3);
  const discoveryFalse =
    last3.length === 3 &&
    last3.every((run) => run.onMarketReconcile?.discoveryComplete === false);
  const discoverAge = age(now, snapshot.discoverCursorUpdatedAt);
  if (discoverAge != null && discoverAge >= MLS_HEALTH_DISCOVER_CRITICAL_MS) {
    findings.push(
      finding(
        "reconcile_discovery",
        "critical",
        "Off-market discovery has not advanced in 48 hours.",
        { discoverAgeHours: Math.round(discoverAge / HOUR) },
      ),
    );
  } else if (
    discoveryFalse ||
    (discoverAge != null && discoverAge >= MLS_HEALTH_DISCOVER_WARNING_MS)
  ) {
    findings.push(
      finding(
        "reconcile_discovery",
        "warning",
        discoveryFalse
          ? "Off-market discovery did not finish on the last three Full runs."
          : "Off-market discovery has not advanced in 24 hours.",
        { discoverAgeHours: discoverAge == null ? null : Math.round(discoverAge / HOUR) },
      ),
    );
  }

  const latest = recent[0];
  const budget = latest?.onMarketReconcile?.rotationBudget ?? 0;
  const rotateAge = age(now, snapshot.rotateCursorUpdatedAt);
  const enabledFor = age(now, seen[seen.length - 1]?.startedAt);
  const rotationAge =
    rotateAge ??
    (enabledFor != null && enabledFor >= MLS_HEALTH_ROTATE_WARNING_MS ? enabledFor : null);
  if (budget > 0 && rotationAge != null && rotationAge >= MLS_HEALTH_ROTATE_WARNING_MS) {
    const critical = rotationAge >= MLS_HEALTH_ROTATE_CRITICAL_MS;
    findings.push(
      finding(
        "reconcile_rotation",
        critical ? "critical" : "warning",
        critical
          ? "Off-market rotation has not progressed in 48 hours."
          : "Off-market rotation has not progressed in 24 hours.",
        { rotateAgeHours: Math.round(rotationAge / HOUR), rotationBudget: budget },
      ),
    );
  }

  const count = snapshot.typesenseRetryCount;
  const previous = snapshot.sample.reconcileRetryCount;
  const growing = previous != null && count > previous;
  const highSince = snapshot.sample.reconcileRetryHighSince;
  const highFor = age(now, highSince);
  if (count >= MLS_HEALTH_RETRY_CRITICAL_COUNT && growing) {
    findings.push(
      finding(
        "reconcile_typesense_retry",
        "critical",
        "The off-market Typesense retry backlog is growing.",
        { retryCount: count },
      ),
    );
  } else if (
    count >= MLS_HEALTH_RETRY_WARNING_COUNT &&
    previous != null &&
    count >= previous &&
    highFor != null &&
    highFor >= MLS_HEALTH_RECONCILE_RECENT_MS
  ) {
    findings.push(
      finding(
        "reconcile_typesense_retry",
        "warning",
        "The off-market Typesense retry backlog has not shrunk in 24 hours.",
        { retryCount: count },
      ),
    );
  }
  return "active";
}

function pushMedia(
  findings: MlsHealthFinding[],
  snapshot: MlsHealthSnapshot,
  reconcileMode: "off" | "stopped" | "active",
): MlsHealthSampleUpdate {
  const current = snapshot.typesenseRetryCount;
  const previous = snapshot.sample.reconcileRetryCount;
  let highSince = snapshot.sample.reconcileRetryHighSince;
  if (
    reconcileMode === "active" &&
    current >= MLS_HEALTH_RETRY_WARNING_COUNT &&
    (previous == null || current >= previous)
  ) {
    highSince = highSince ?? snapshot.now;
  } else {
    highSince = null;
  }

  const activeZeroPhotos = Math.max(0, Math.floor(snapshot.activeZeroPhotos));
  let baseline = snapshot.sample.zeroPhotoBaseline;
  let streak = snapshot.sample.zeroPhotoElevatedStreak;
  if (baseline == null) {
    baseline = activeZeroPhotos;
    streak = 0;
  } else {
    const jump = activeZeroPhotos - baseline;
    if (
      activeZeroPhotos >= MLS_HEALTH_MEDIA_CRITICAL_ABSOLUTE ||
      jump >= MLS_HEALTH_MEDIA_CRITICAL_DELTA
    ) {
      streak += 1;
      findings.push(
        finding(
          "media_zero_photos",
          "critical",
          "ACTIVE listings with zero photos jumped sharply.",
          { activeZeroPhotos, baseline, jump },
        ),
      );
    } else if (jump >= MLS_HEALTH_MEDIA_WARNING_DELTA) {
      streak += 1;
      if (streak >= 2) {
        findings.push(
          finding(
            "media_zero_photos",
            "warning",
            "ACTIVE listings with zero photos are above the baseline on consecutive checks.",
            { activeZeroPhotos, baseline, jump },
          ),
        );
      }
    } else {
      streak = 0;
      baseline = activeZeroPhotos;
    }
  }

  const mediaRuns = byFinishedDesc(
    snapshot.runs.filter(
      (run) => (run.resource === "all" || run.resource === "media") && isFinished(run),
    ),
  );
  const last3 = mediaRuns.slice(0, 3);
  if (last3.length === 3 && last3.every((run) => run.mediaErrorCount > 0)) {
    findings.push(
      finding(
        "media_failures",
        "warning",
        "Three consecutive MLS runs recorded media failures.",
        { runs: 3 },
      ),
    );
  }

  const fetchRuns = byFinishedDesc(
    snapshot.runs.filter(
      (run) =>
        (run.resource === "fast" || run.resource === "all" || run.resource === "media") &&
        isFinished(run),
    ),
  ).slice(0, 6);
  const fetches = fetchRuns.reduce((sum, run) => sum + run.mediaFetches, 0);
  if (
    snapshot.sample.zeroPhotoBaseline != null &&
    activeZeroPhotos > snapshot.sample.zeroPhotoBaseline &&
    fetchRuns.length > 0 &&
    fetches === 0
  ) {
    findings.push(
      finding(
        "media_stalled",
        "warning",
        "ACTIVE zero-photo inventory is above baseline and recent runs fetched no media.",
        { activeZeroPhotos, baseline: snapshot.sample.zeroPhotoBaseline },
      ),
    );
  }

  return {
    activeZeroPhotos,
    zeroPhotoBaseline: baseline,
    zeroPhotoElevatedStreak: streak,
    reconcileRetryCount: current,
    reconcileRetryHighSince: highSince,
  };
}
