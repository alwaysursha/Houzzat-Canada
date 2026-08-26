# Tenant B Canary Rollback Runbook

Stage 3K.5.4 (documentation only).

## Rollback goal

Return `tenant-canary.houzzatpro.com` to the production `houzzat` Worker without affecting other hostnames or database state.

## Steps

1. Cloudflare dashboard → Worker `houzzat-tenant-canary` → Domains & Routes.
2. **Remove** `tenant-canary.houzzatpro.com` from `houzzat-tenant-canary`.
3. Cloudflare dashboard → Worker `houzzat` → Domains & Routes.
4. **Add** `tenant-canary.houzzatpro.com` back to `houzzat`.
5. Verify TLS and `curl -I https://tenant-canary.houzzatpro.com`.
6. Confirm `canary.houzzat.com` remains ACTIVE on `houzzat` (unchanged throughout).

## Optional cleanup

- Leave `houzzat-tenant-canary` Worker deployed but unbound (dormant), or delete the Worker after rollback.
- No database rollback required — canary infra cutover does not migrate data.

## What rollback does NOT do

- Does not revert code commits (git revert separately if needed)
- Does not remove Tenant B `WorkspaceDomain` / `WorkspaceBranding` rows
- Does not retire or modify `canary.houzzat.com`
