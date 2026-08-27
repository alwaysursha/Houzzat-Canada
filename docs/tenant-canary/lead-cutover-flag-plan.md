# Tenant Canary — Public Lead Cutover Flag Plan

**Current production/canary state:** `TENANT_PUBLIC_LEAD_SCOPE=legacy`

**Do not flip flags until every prerequisite below passes.**

---

## Future cutover change (canary Worker only)

In `wrangler.tenant-canary.jsonc`:

```jsonc
"TENANT_PUBLIC_LEAD_SCOPE": "workspace"
```

Also required together (already set on canary for domain/branding):

```jsonc
"TENANT_DOMAIN_SCOPE": "workspace",
"TENANT_BRANDING_SCOPE": "workspace",
"WORKSPACE_ROUTING_SCOPE": "workspace",
"WORKSPACE_NOTIFICATION_SCOPE": "workspace"
```

**Production `houzzat` Worker:** separate staged cutover — not part of Tenant B canary flag flip.

---

## Prerequisites (must pass before flip)

1. **Hostname routing** — `tenant-canary.houzzatpro.com` → Tenant B workspace; unknown hosts fail closed
2. **Sign-up lead tenancy** — `/api/auth/sign-up` passes `request` into `captureWebsiteLead()`
3. **Workspace desk routing** — Tenant B has ACTIVE members + `CrmRoutingSettings` row
4. **Organization model** — workspace-scoped org resolution (Houzzat brokerage vs tenant compat org)
5. **Assignee isolation** — assignee must be ACTIVE workspace member
6. **Notification isolation** — staff push/email recipients filtered by lead `workspaceId`
7. **Notification branding** — tenant display name in staff copy (not hardcoded Houzzat)
8. **Dry-run matrix** — all 7 public lead paths pass A/B/C/D harness
9. **Legacy regression** — Houzzat behavior unchanged while scope remains `legacy`
10. **Manual auth smoke** — credentials auth on tenant-canary hostname (see `auth-manual-smoke-runbook.md`)
11. **Controlled canary lead test** — optional `workspace:lead-canary` dry-run with `CANARY_LEAD_B_EMAIL` (no production mutations unless explicitly approved)

---

## Rollback

Set back immediately:

```jsonc
"TENANT_PUBLIC_LEAD_SCOPE": "legacy"
```

Redeploy `houzzat-tenant-canary` only. No DNS changes required.

---

## Post-cutover verification

1. Submit test inquiry on `tenant-canary.houzzatpro.com` (controlled email — not production staff blast)
2. Confirm lead `workspaceId` = Tenant B
3. Confirm assignee ∈ Tenant B workspace members
4. Confirm Houzzat lead desk unchanged
5. Confirm `houzzat.com` leads still route to Houzzat

---

## Explicit non-goals at cutover

- Do **not** flip production `houzzat` Worker in the same change
- Do **not** disable `canary.houzzat.com` (legacy interim host — separate decision)
- Do **not** enable Google OAuth until auth provider URLs are tenant-aware
