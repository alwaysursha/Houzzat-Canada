# Tenant B Hostname Cutover Runbook

Stage 3K.5.4 (documentation only — **not executed**).

## Current state

```
tenant-canary.houzzatpro.com  →  Worker: houzzat
houzzat.com                   →  Worker: houzzat
www.houzzat.com               →  Worker: houzzat
houzzat.houzzatpro.com        →  Worker: houzzat
canary.houzzat.com            →  Worker: houzzat (legacy interim — keep)
```

## Target state

```
tenant-canary.houzzatpro.com  →  Worker: houzzat-tenant-canary
(all other hostnames unchanged on houzzat Worker)
```

## Cloudflare custom-domain exclusivity

A hostname can be attached to **only one** Worker at a time. Cloudflare does **not** allow the same custom domain on two Workers simultaneously.

**Attach-before-detach is NOT possible** for the same hostname. You must **remove** the domain from `houzzat` before (or as part of) assigning it to `houzzat-tenant-canary`.

DNS CNAME typically stays unchanged; only the Worker custom-domain binding changes.

## Safest dashboard sequence

### Pre-cutover

1. Deploy `houzzat-tenant-canary` Worker (use `pnpm deploy:cf:tenant-canary` after approval).
2. Copy required secrets per `secrets-runbook.md`.
3. Smoke-test on `houzzat-tenant-canary.<account>.workers.dev` (Host header or workers.dev URL).
4. Verify credentials auth on workers.dev URL before hostname cutover.

### Cutover (maintenance window — brief)

1. **Remove** `tenant-canary.houzzatpro.com` from Worker `houzzat` → Domains & Routes.
2. **Add** `tenant-canary.houzzatpro.com` to Worker `houzzat-tenant-canary` → Domains & Routes.
3. Wait for TLS certificate provisioning (usually automatic, 1–5 minutes).
4. Verify:
   - `curl -I https://tenant-canary.houzzatpro.com` → 200, `x-opennext: 1`
   - Tenant Canary branding in HTML (not Houzzat)
   - `__Secure-authjs.callback-url` uses `https://tenant-canary.houzzatpro.com` (not houzzat.com)
5. Verify production unchanged:
   - `https://houzzat.com` still Houzzat
   - `https://houzzat.houzzatpro.com` still Houzzat

### Do NOT change

- `houzzat.com` / `www.houzzat.com` bindings
- `houzzat.houzzatpro.com` binding
- `canary.houzzat.com` binding
- `houzzatpro.com` / `www.houzzatpro.com` (marketing — never tenant Worker)
- DNS records (unless intentionally updating CNAME target — usually not required)

## Expected downtime

Brief gap (seconds to minutes) between step 1 and step 2 while hostname is unassigned. Schedule accordingly.
