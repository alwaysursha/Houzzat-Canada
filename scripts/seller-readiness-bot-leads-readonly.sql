-- Read-only investigation: likely bot / low-quality Seller Readiness leads.
-- Do NOT run DELETE/UPDATE. Review in CRM before any manual action.
-- Phone lives on User, not Lead.

-- 1) Volume by hour (last 14 days)
SELECT date_trunc('hour', l."createdAt") AS hour_bucket,
       COUNT(*)::int AS leads,
       COUNT(*) FILTER (WHERE u."emailVerified" IS NULL)::int AS unverified_users,
       COUNT(*) FILTER (
         WHERE COALESCE(u.phone, '') = '' AND COALESCE(u."phoneE164", '') = ''
       )::int AS missing_phone
FROM "Lead" l
LEFT JOIN "User" u ON u.id = l."customerId"
WHERE l.source::text = 'SELLER_READINESS'
  AND l."createdAt" >= NOW() - INTERVAL '14 days'
GROUP BY 1
ORDER BY 1 DESC;

-- 2) Suspect queue (no PII columns): missing phone, unverified, no consent, NEW_LEAD
SELECT l.id,
       l."workspaceId",
       l.status::text AS status,
       l."createdAt",
       (u."emailVerified" IS NULL) AS email_unverified,
       (COALESCE(u.phone, '') = '' AND COALESCE(u."phoneE164", '') = '') AS missing_phone,
       (l."contactConsentAt" IS NULL) AS no_consent,
       (
         SELECT COUNT(*)::int
         FROM "LeadActivity" a
         WHERE a."leadId" = l.id
       ) AS activity_count,
       (
         SELECT COUNT(*)::int
         FROM "Appointment" ap
         WHERE ap."leadId" = l.id
       ) AS appointment_count
FROM "Lead" l
LEFT JOIN "User" u ON u.id = l."customerId"
WHERE l.source::text = 'SELLER_READINESS'
  AND l."createdAt" >= NOW() - INTERVAL '30 days'
  AND l.status = 'NEW_LEAD'
  AND l."contactConsentAt" IS NULL
  AND (u.id IS NULL OR u."emailVerified" IS NULL)
  AND (
    u.id IS NULL
    OR (COALESCE(u.phone, '') = '' AND COALESCE(u."phoneE164", '') = '')
  )
ORDER BY l."createdAt" DESC
LIMIT 200;

-- 3) Burst detection: same workspace, many creates within 1 hour
SELECT l."workspaceId",
       date_trunc('hour', l."createdAt") AS hour_bucket,
       COUNT(*)::int AS n
FROM "Lead" l
WHERE l.source::text = 'SELLER_READINESS'
  AND l."createdAt" >= NOW() - INTERVAL '30 days'
GROUP BY 1, 2
HAVING COUNT(*) >= 3
ORDER BY n DESC, hour_bucket DESC;
