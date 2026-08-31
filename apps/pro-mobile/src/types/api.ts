/**
 * Stage 4.0 — HouzzatPRO Mobile v2 API Contracts.
 *
 * MOBILE API ORIGIN:
 * All native mobile v2 backend communication targets:
 * https://app.houzzatpro.com/api/mobile/v2/
 */

import type { MobileUser, MobileAuthTokens } from "./auth";
import type { MobileWorkspace, MobileWorkspaceMembership } from "./workspace";

export const MOBILE_V2_API_BASE_URL = "https://app.houzzatpro.com/api/mobile/v2";

export type ApiErrorCode =
  | "AUTH_REQUIRED"
  | "INVALID_CREDENTIALS"
  | "WORKSPACE_FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "SERVER_ERROR";

export interface ApiErrorResponse {
  ok: false;
  code: ApiErrorCode;
  message: string;
  details?: unknown;
}

export interface ApiSuccessResponse<T> {
  ok: true;
  data: T;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface BackendEnvelope<T> {
  ok: boolean;
  data: T;
  code?: string;
  message?: string;
}

export interface LoginResponseData {
  user: MobileUser;
  tokens: MobileAuthTokens;
}

export interface WorkspacesResponseData {
  memberships: MobileWorkspaceMembership[];
}

export interface WorkspaceSessionResponseData {
  workspace: MobileWorkspace;
  membership: MobileWorkspaceMembership;
  tokens: {
    accessToken: string;
    expiresAt: number;
  };
}

export interface RefreshResponseData {
  tokens: {
    accessToken: string;
    expiresAt: number;
  };
}

export interface RequestOptions extends RequestInit {
  timeoutMs?: number;
  workspaceId?: string; // Multi-tenant scope parameter
  token?: string;
  skipAuth?: boolean;
}
