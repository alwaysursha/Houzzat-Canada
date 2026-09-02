/**
 * Stage 4.0 — HouzzatPRO Mobile v2 Centralized API Client.
 *
 * Configured for:
 * - Origin: https://app.houzzatpro.com/api/mobile/v2
 * - Bearer token authorization
 * - Workspace isolation via header (x-workspace-id)
 * - Timeout handling & typed errors
 * - Silent 401 → refresh → retry (WhatsApp-style keep-alive)
 */

import {
  MOBILE_V2_API_BASE_URL,
  type ApiErrorCode,
  type ApiErrorResponse,
  type ApiResponse,
  type RequestOptions,
} from "../types/api";

export class MobileApiClient {
  private baseUrl: string;
  private tokenProvider?: () => Promise<string | null>;
  private workspaceIdProvider?: () => string | null;
  /** Returns true when a fresh access token was obtained. */
  private unauthorizedHandler?: () => Promise<boolean>;

  constructor(options?: {
    baseUrl?: string;
    tokenProvider?: () => Promise<string | null>;
    workspaceIdProvider?: () => string | null;
  }) {
    this.baseUrl = (options?.baseUrl ?? MOBILE_V2_API_BASE_URL).replace(/\/+$/, "");
    this.tokenProvider = options?.tokenProvider;
    this.workspaceIdProvider = options?.workspaceIdProvider;
  }

  public setTokenProvider(provider: () => Promise<string | null>): void {
    this.tokenProvider = provider;
  }

  public setWorkspaceIdProvider(provider: () => string | null): void {
    this.workspaceIdProvider = provider;
  }

  public setUnauthorizedHandler(handler: () => Promise<boolean>): void {
    this.unauthorizedHandler = handler;
  }

  public async request<T>(
    endpoint: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<T>> {
    const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    const url = `${this.baseUrl}${cleanEndpoint}`;
    const timeoutMs = options.timeoutMs ?? 15000;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers = new Headers(options.headers || {});
      headers.set("Accept", "application/json");

      if (options.body && typeof options.body === "string" && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }

      // 1. Bearer Token Auth
      if (!options.skipAuth) {
        const token = options.token ?? (this.tokenProvider ? await this.tokenProvider() : null);
        if (token) {
          headers.set("Authorization", `Bearer ${token}`);
        }
      }

      // 2. Multi-tenant workspace isolation header
      const wsId = options.workspaceId ?? (this.workspaceIdProvider ? this.workspaceIdProvider() : null);
      if (wsId) {
        headers.set("x-workspace-id", wsId);
      }

      const res = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timer);

      let payload: unknown;
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        payload = await res.json();
      } else {
        payload = await res.text();
      }

      if (!res.ok) {
        const mapped = this.mapHttpError(res.status, payload);

        // Silent keep-alive: refresh once, then retry the original request.
        if (
          mapped.code === "AUTH_REQUIRED" &&
          !options.skipAuth &&
          !options._authRetried &&
          this.unauthorizedHandler
        ) {
          const refreshed = await this.unauthorizedHandler();
          if (refreshed) {
            return this.request<T>(endpoint, {
              ...options,
              token: undefined,
              _authRetried: true,
            });
          }
        }

        return mapped;
      }

      return {
        ok: true,
        data: payload as T,
      };
    } catch (err: unknown) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === "AbortError") {
        return {
          ok: false,
          code: "TIMEOUT",
          message: `Request timed out after ${timeoutMs}ms`,
        };
      }
      return {
        ok: false,
        code: "NETWORK_ERROR",
        message: err instanceof Error ? err.message : "Network error occurred",
      };
    }
  }

  public async get<T>(endpoint: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: "GET" });
  }

  public async post<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  public async patch<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  public async put<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  public async delete<T>(endpoint: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: "DELETE" });
  }

  /**
   * Stage 5.12B — binary PDF download (application/pdf).
   * Longer timeout — Browser Rendering is slower than JSON APIs.
   */
  public async getPdf(
    endpoint: string,
    options?: RequestOptions,
  ): Promise<
    | { ok: true; bytes: ArrayBuffer; filename: string | null }
    | ApiErrorResponse
  > {
    const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    const url = `${this.baseUrl}${cleanEndpoint}`;
    const timeoutMs = options?.timeoutMs ?? 90000;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers = new Headers(options?.headers || {});
      headers.set("Accept", "application/pdf");

      if (!options?.skipAuth) {
        const token =
          options?.token ??
          (this.tokenProvider ? await this.tokenProvider() : null);
        if (token) {
          headers.set("Authorization", `Bearer ${token}`);
        }
      }

      const wsId =
        options?.workspaceId ??
        (this.workspaceIdProvider ? this.workspaceIdProvider() : null);
      if (wsId) {
        headers.set("x-workspace-id", wsId);
      }

      const res = await fetch(url, {
        method: "GET",
        headers,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        let payload: unknown = null;
        const ct = res.headers.get("content-type") ?? "";
        if (ct.includes("application/json")) {
          payload = await res.json();
        } else {
          payload = await res.text();
        }
        const mapped = this.mapHttpError(res.status, payload);

        if (
          mapped.code === "AUTH_REQUIRED" &&
          !options?.skipAuth &&
          !options?._authRetried &&
          this.unauthorizedHandler
        ) {
          const refreshed = await this.unauthorizedHandler();
          if (refreshed) {
            return this.getPdf(endpoint, {
              ...options,
              token: undefined,
              _authRetried: true,
            });
          }
        }
        return mapped;
      }

      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/pdf")) {
        return {
          ok: false,
          code: "SERVER_ERROR",
          message: "Couldn't generate PDF",
        };
      }

      const bytes = await res.arrayBuffer();
      if (bytes.byteLength < 5) {
        return {
          ok: false,
          code: "SERVER_ERROR",
          message: "Couldn't generate PDF",
        };
      }

      const disposition = res.headers.get("content-disposition") ?? "";
      const match = /filename="([^"]+)"/i.exec(disposition);
      return {
        ok: true,
        bytes,
        filename: match?.[1] ?? null,
      };
    } catch (err: unknown) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === "AbortError") {
        return {
          ok: false,
          code: "TIMEOUT",
          message: `Request timed out after ${timeoutMs}ms`,
        };
      }
      return {
        ok: false,
        code: "NETWORK_ERROR",
        message: err instanceof Error ? err.message : "Network error occurred",
      };
    }
  }

  private mapHttpError(status: number, payload: unknown): ApiErrorResponse {
    let code: ApiErrorCode = "SERVER_ERROR";
    let message = `Request failed with status ${status}`;

    if (payload && typeof payload === "object" && "message" in payload) {
      message = String((payload as { message: unknown }).message);
    }

    if (status === 401) {
      code = "AUTH_REQUIRED";
    } else if (status === 403) {
      code = "WORKSPACE_FORBIDDEN";
    } else if (status === 404) {
      code = "NOT_FOUND";
    } else if (status === 400 || status === 422) {
      code = "VALIDATION_ERROR";
    } else if (status >= 500) {
      code = "SERVER_ERROR";
    }

    return {
      ok: false,
      code,
      message,
      details: payload,
    };
  }
}

export const mobileApiClient = new MobileApiClient();
