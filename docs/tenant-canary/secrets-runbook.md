# Tenant B Canary — Minimal Secrets Matrix (Stage 3K.5.4.1)

Target Worker: `houzzat-tenant-canary`  
Do not copy secrets until user approves first deploy.

## Required for initial canary

| Secret / binding | Required? | Why | Can defer? |
|------------------|-----------|-----|------------|
| `DATABASE_URL` | **Yes** | Prisma boot; hostname → WorkspaceDomain/Branding reads | No |
| `AUTH_SECRET` | **Yes** | Auth.js v5 JWT/session signing (canonical) | No |
| `TYPESENSE_HOST` | **Yes** | Homepage/search listing rails (read) | No* |
| `TYPESENSE_SEARCH_API_KEY` | **Yes** | Typesense search-only queries | No* |
| `ASSETS` binding | **Yes** | OpenNext static assets | No |
| `WORKER_SELF_REFERENCE` → `houzzat-tenant-canary` | **Yes** | OpenNext self-invocation | No |

\*Browse without Typesense may partially work from Neon fallback paths, but homepage market rails expect Typesense when `TYPESENSE_SEARCH=1`.

## Canonical auth secret

Auth.js v5 uses **`AUTH_SECRET`** as the primary secret.  
`NEXTAUTH_SECRET` is a legacy alias read by `active-workspace.ts` and health checks as fallback.

**Minimal:** copy `AUTH_SECRET` only.  
**Safe:** copy both `AUTH_SECRET` and `NEXTAUTH_SECRET` with the same value (matches production deploy.yml).

Do **not** require both if only `AUTH_SECRET` is set — code falls back correctly.

## Explicitly defer for initial canary

| Secret | Defer? | Why |
|--------|--------|-----|
| `NEXTAUTH_SECRET` | Optional duplicate of AUTH_SECRET | Legacy alias only |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | **Yes** | OAuth not in initial smoke test |
| `RESEND_API_KEY` | **Yes** | No email on browse/login smoke |
| `EMAIL_FROM*` / `EMAIL_ADMIN_TO` | **Yes** | Email |
| Firebase / FCM push secrets | **Yes** | Push only on native + authenticated |
| `PROPTX_*` bearer tokens | **Defer*** | Listing live-photo refresh; Neon-cached media may suffice for homepage |
| `GOOGLE_MAPS_API_KEY` | **Yes** | Route planner / maps |
| `MLS_SYNC_SECRET` | **Yes** | Cron only |
| `DIGEST_CRON_SECRET` | **Yes** | Cron only |

## Plain vars (canary wrangler only)

| Var | Purpose |
|-----|---------|
| `ACTIVITY_BEACON_DISABLED=1` | Disables client analytics beacon — prevents shared `SiteVisitor`/`ActivityEvent` writes |
| `TYPESENSE_SYNC=0` | Worker must not upsert Typesense |
| `TENANT_PUBLIC_LEAD_SCOPE=legacy` | Public leads stay Houzzat routing |

## Commands (after user approval only)

```bash
wrangler secret put DATABASE_URL --config wrangler.tenant-canary.jsonc
wrangler secret put AUTH_SECRET --config wrangler.tenant-canary.jsonc
wrangler secret put TYPESENSE_HOST --config wrangler.tenant-canary.jsonc
wrangler secret put TYPESENSE_SEARCH_API_KEY --config wrangler.tenant-canary.jsonc
```
