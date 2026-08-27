# Tenant Canary — Credentials Auth Manual Smoke Runbook

Manual verification for **credentials auth** on the isolated Tenant B Worker (`houzzat-tenant-canary`).

**Hostname:** https://tenant-canary.houzzatpro.com

**Do not** create new production users for this check. Use an existing authorized test account if available.

**Do not** record passwords, session tokens, or cookie values in tickets, screenshots, or logs.

---

## Preconditions

- `houzzat-tenant-canary` Worker is deployed and serving `tenant-canary.houzzatpro.com`
- `NEXTAUTH_URL` / `AUTH_URL` are **not** pinned on the canary Worker
- Browser devtools Network tab open (filter: `auth`, `session`, `account`)

---

## Checklist

### 1. Sign in

1. Open https://tenant-canary.houzzatpro.com/auth/sign-in
2. Confirm page branding shows **Tenant Canary** (not Houzzat)
3. Sign in with an existing test account
4. Confirm redirect stays on `tenant-canary.houzzatpro.com` (no hop to `houzzat.com`)

### 2. Session survives navigation

1. Navigate to `/search`, `/open-houses`, and a listing detail page
2. Confirm header/account chrome still shows signed-in state
3. Confirm hostname remains `tenant-canary.houzzatpro.com`

### 3. Account loads

1. Open https://tenant-canary.houzzatpro.com/account
2. Confirm account page loads without redirect to Houzzat
3. Confirm tenant branding in chrome/footer

### 4. Callback URL isolation

In devtools, inspect the Auth.js session/callback flow:

- `callbackUrl` cookie domain is host-only for `tenant-canary.houzzatpro.com`
- No `houzzat.com` origin in redirect chain after sign-in

### 5. Logout

1. Sign out via `/auth/sign-out` or account menu
2. Confirm session cleared on tenant-canary hostname
3. Protected routes (e.g. `/account`) redirect to sign-in on **tenant-canary**, not Houzzat

---

## Pass criteria

- All steps complete without cross-host redirect to `houzzat.com`
- Branding remains Tenant Canary throughout
- No OAuth prompts (credentials only in this stage)

## Fail criteria

- Redirect to `houzzat.com` during sign-in, session refresh, or logout
- Houzzat branding on auth/account surfaces
- `callback-url` cookie scoped to wrong host

---

## Notes

- Google OAuth is **out of scope** for this runbook (Stage 3K.5.7)
- Compare against Houzzat production (`houzzat.com`) only to confirm hosts remain independent — do not share sessions between hosts
