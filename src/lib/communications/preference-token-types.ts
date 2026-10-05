export const COMMUNICATION_PREFERENCE_TOKEN_PURPOSES = [
  "manage",
  "one_click",
] as const;

export type CommunicationPreferenceTokenPurpose =
  (typeof COMMUNICATION_PREFERENCE_TOKEN_PURPOSES)[number];

export type CommunicationPreferenceTokenRecord = {
  id: string;
  tokenHash: string;
  purpose: CommunicationPreferenceTokenPurpose;
  userId: string;
  workspaceId: string;
  emailNormalized: string;
  expiresAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  source: string;
};

export type PreferenceTokenResolveError =
  | "invalid_token"
  | "expired"
  | "revoked"
  | "workspace_mismatch"
  | "email_mismatch"
  | "user_unavailable"
  | "purpose_mismatch";

export type ResolvedPreferenceToken = {
  record: CommunicationPreferenceTokenRecord;
  user: {
    id: string;
    email: string;
    workspaceId: string;
    emailAlertsEnabled: boolean;
    disabledAt: Date | null;
  };
};

export type CommunicationPreferenceTokenStore = {
  findByHash(
    tokenHash: string,
  ): Promise<CommunicationPreferenceTokenRecord | null>;
  create(
    record: Omit<
      CommunicationPreferenceTokenRecord,
      "id" | "lastUsedAt" | "revokedAt"
    > & {
      id?: string;
      lastUsedAt?: Date | null;
      revokedAt?: Date | null;
    },
  ): Promise<CommunicationPreferenceTokenRecord>;
  revokeById(id: string, at: Date): Promise<void>;
  revokeActiveForUser(input: {
    userId: string;
    at: Date;
  }): Promise<number>;
  deleteExpiredForUser(input: { userId: string; now: Date }): Promise<number>;
  touchLastUsed(id: string, at: Date): Promise<void>;
};
