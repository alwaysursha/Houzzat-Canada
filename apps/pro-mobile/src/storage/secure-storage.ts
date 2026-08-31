/**
 * Stage 4.0 — HouzzatPRO Mobile v2 Secure Storage Abstraction.
 *
 * Designed for hardware-backed keystore/keychain storage (Android EncryptedSharedPreferences / iOS Keychain).
 * Explicitly forbids localStorage, sessionStorage, or document.cookie.
 */

export interface ISecureStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
}

export const SECURE_STORAGE_KEYS = {
  AUTH_TOKENS: "houzzat_pro_v2_tokens",
  USER_PROFILE: "houzzat_pro_v2_user",
  ACTIVE_WORKSPACE_ID: "houzzat_pro_v2_active_ws",
} as const;

/**
 * In-memory fallback and test store.
 * In a native production runtime, this delegates to hardware-backed secure storage.
 */
class MemorySecureStorage implements ISecureStorage {
  private store = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    if (typeof key !== "string" || key.trim().length === 0) {
      throw new Error(`[SecureStorage] Invalid key: expected non-empty string, got ${typeof key}`);
    }
    return this.store.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    if (typeof key !== "string" || key.trim().length === 0) {
      throw new Error(`[SecureStorage] Invalid key: expected non-empty string, got ${typeof key}`);
    }
    if (typeof value !== "string") {
      throw new Error(`[SecureStorage] Invalid value for key "${key}": expected string, got ${value === null ? "null" : typeof value}`);
    }
    this.store.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    if (typeof key !== "string" || key.trim().length === 0) {
      throw new Error(`[SecureStorage] Invalid key: expected non-empty string, got ${typeof key}`);
    }
    this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }
}

let activeStorageInstance: ISecureStorage = new MemorySecureStorage();

/**
 * Configure the active secure storage engine (e.g. at app bootstrap).
 */
export function setSecureStorageEngine(engine: ISecureStorage): void {
  activeStorageInstance = engine;
}

export const SecureStorage: ISecureStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (typeof key !== "string" || key.trim().length === 0) {
      throw new Error(`[SecureStorage] Invalid key: expected non-empty string, got ${typeof key}`);
    }
    return activeStorageInstance.getItem(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (typeof key !== "string" || key.trim().length === 0) {
      throw new Error(`[SecureStorage] Invalid key: expected non-empty string, got ${typeof key}`);
    }
    if (typeof value !== "string") {
      throw new Error(`[SecureStorage] Invalid value for key "${key}": expected string, got ${value === null ? "null" : typeof value}`);
    }
    return activeStorageInstance.setItem(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    if (typeof key !== "string" || key.trim().length === 0) {
      throw new Error(`[SecureStorage] Invalid key: expected non-empty string, got ${typeof key}`);
    }
    return activeStorageInstance.removeItem(key);
  },
  clear: async (): Promise<void> => activeStorageInstance.clear(),
};
