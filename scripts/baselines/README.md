# Tenancy baselines (read-only snapshots)

Production BEFORE snapshot for Workspace migration Stages 1+.

| File | Captured |
|---|---|
| `production-tenancy-baseline-2026-08-24T1735Z.json` | Phase 0C — before Workspace foundation |
| `production-tenancy-baseline-2026-08-24T-post-stage1.json` | Stage 1 — after additive migration (empty Workspace tables) |

Regenerate (read-only):

```bash
pnpm tenancy:baseline > scripts/baselines/production-tenancy-baseline-$(date -u +%Y-%m-%dT%H%MZ).json
```

Do not commit database credentials. Baseline output contains counts and 8-char id prefixes only.
