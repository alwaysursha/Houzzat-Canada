/**
 * Stage 5.12A — Advanced CMA thresholds (centralized, testable).
 */

export const CMA_ENGINE_CONFIG = {
  candidatePoolTarget: 160,
  candidatePoolMax: 200,
  defaultSoldLimit: 10,
  defaultCompetitionLimit: 6,
  minStrongSoldForHigh: 6,
  minStrongSoldForGood: 3,
  strongScoreFloor: 70,
  /** Half-life days for sold recency weight. */
  soldHalfLifeDays: 100,
  outlierIqrMultiplier: 1.5,
  passes: [
    {
      stage: 1,
      maxKm: 1.5,
      maxSoldAgeDays: 90,
      sqftTolerance: 0.15,
      sameCommunityPreferred: true,
    },
    {
      stage: 2,
      maxKm: 3,
      maxSoldAgeDays: 180,
      sqftTolerance: 0.25,
      sameCommunityPreferred: false,
    },
    {
      stage: 3,
      maxKm: 8,
      maxSoldAgeDays: 365,
      sqftTolerance: 0.35,
      sameCommunityPreferred: false,
    },
  ],
} as const;

export type CmaWidenPass = (typeof CMA_ENGINE_CONFIG.passes)[number];
