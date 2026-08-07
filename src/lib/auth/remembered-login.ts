/**
 * Device-local login remember for post-VOW re-auth UX.
 * Password never goes to the server for "remember", never logged, and only
 * lives in the browser (Credential Management API, with localStorage fallback).
 */

const EMAIL_KEY = "houzzat.rememberedEmail";
const PASSWORD_KEY = "houzzat.rememberedSecret";
const HAD_SESSION_KEY = "houzzat.hadClientSession";

function canUseDom() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function hadClientSession(): boolean {
  if (!canUseDom()) return false;
  return localStorage.getItem(HAD_SESSION_KEY) === "1";
}

export function getRememberedEmail(): string {
  if (!canUseDom()) return "";
  return (localStorage.getItem(EMAIL_KEY) ?? "").trim().toLowerCase();
}

export function markClientSession(email: string) {
  if (!canUseDom()) return;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return;
  localStorage.setItem(EMAIL_KEY, normalized);
  localStorage.setItem(HAD_SESSION_KEY, "1");
}

/** Store credentials on this device after a successful sign-in / sign-up. */
export async function rememberLoginCredentials(input: {
  email: string;
  password: string;
}): Promise<void> {
  if (!canUseDom()) return;
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  if (!email || !password) return;

  markClientSession(email);

  try {
    const PasswordCredentialCtor = (
      window as Window & {
        PasswordCredential?: new (data: {
          id: string;
          password: string;
          name?: string;
        }) => Credential;
      }
    ).PasswordCredential;
    if (PasswordCredentialCtor && navigator.credentials?.store) {
      const cred = new PasswordCredentialCtor({
        id: email,
        password,
        name: email,
      });
      await navigator.credentials.store(cred);
    }
  } catch {
    // Browser declined — fall through to local remember.
  }

  // Fallback so Safari / browsers without PasswordCredential still prefill.
  try {
    localStorage.setItem(PASSWORD_KEY, password);
  } catch {
    // Quota / private mode — email-only remember still works.
  }
}

export type RememberedLogin = {
  email: string;
  password: string;
};

/** Load remembered credentials for the sign-in form (password stays masked in UI). */
export async function loadRememberedLogin(): Promise<RememberedLogin | null> {
  if (!canUseDom()) return null;

  const storedEmail = getRememberedEmail();

  try {
    if (navigator.credentials?.get) {
      const cred = (await navigator.credentials.get({
        password: true,
        mediation: "optional",
      } as CredentialRequestOptions)) as
        | (Credential & { id?: string; password?: string })
        | null;
      if (cred && typeof cred.password === "string" && cred.password) {
        const email = (cred.id || storedEmail).trim().toLowerCase();
        if (email) {
          markClientSession(email);
          return { email, password: cred.password };
        }
      }
    }
  } catch {
    // ignore
  }

  if (!storedEmail) return null;

  let password = "";
  try {
    password = localStorage.getItem(PASSWORD_KEY) ?? "";
  } catch {
    password = "";
  }

  return { email: storedEmail, password };
}

/** Clear remembered password (keeps email + had-session for “Login again”). */
export function clearRememberedPassword() {
  if (!canUseDom()) return;
  try {
    localStorage.removeItem(PASSWORD_KEY);
  } catch {
    // ignore
  }
}
