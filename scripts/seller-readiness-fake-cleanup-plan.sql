-- =============================================================================
-- Seller Readiness fake-signup cleanup plan (Houzzat workspace ONLY)
-- READ-ONLY until explicitly approved. Do NOT run DELETE sections without:
--   1) Review of the ID lists below
--   2) Successful backup/export of the exact rows
--   3) Explicit owner approval
-- Workspace: slug=houzzat id=cmt7kfcth0000gvu0bqsycsvz
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A) HIGH-confidence fake lead IDs (Oct 3 – Oct 14 2026 wave)
-- ---------------------------------------------------------------------------
-- Lead IDs:
--   cmusg75rh000306p3nxzren30  (2026-10-03)
--   cmv3vfypr000506l80f9ff4ew  (2026-10-11)
--   cmv4ztvu1000l06l5vqu7cbgf  (2026-10-12)
--   cmv52p9o8002206jjiiwepdhx  (2026-10-12)
--   cmv5twfys000a06l4ibebwxcj  (2026-10-12)
--   cmv5v65ni000j06kznc7aggfx  (2026-10-12)
--   cmv6zi2go000706jsvtsahzhl  (2026-10-13)
--   cmv74qx96002806l58u804yvq  (2026-10-13)
--   cmv7dxm1u000c06jp0cbq78qn  (2026-10-14)
--   cmv7ka6sx000j06l3chjisvsz  (2026-10-14)
--   cmv7ykjjw000b06jo0h1t1b3g  (2026-10-14)

-- User IDs (1:1 with leads above; verify before delete):
--   cmusg75i0000206p37op3ubbu
--   cmv3vfyi9000406l85tajqy3z
--   cmv4ztvld000k06l5nf1aje95
--   cmv52p9fu002106jj2kg14s93
--   cmv5twfps000906l43zg71tf3
--   cmv5v65ew000i06kz4uvpqohs
--   cmv6zi27k000606jss25xicsc
--   cmv74qwzr002706l5wpqgphbd
--   cmv7dxlrk000b06jp4h9fzuk8
--   cmv7ka6j9000i06l3m7kl1p1r
--   cmv7ykjb3000a06jombf948y4

-- B) MANUAL REVIEW (do NOT auto-delete)
--   cms7f861400drfvu0wyzk39ub  (2026-07-30, status CONTACTED, no customer)

-- C) RETAIN: none identified in the Oct wave with meaningful engagement.

-- ---------------------------------------------------------------------------
-- 0) Safety: confirm all candidates are Houzzat-only
-- ---------------------------------------------------------------------------
SELECT l.id, l."workspaceId", w.slug, l.source::text, l."createdAt"
FROM "Lead" l
JOIN "Workspace" w ON w.id = l."workspaceId"
WHERE l.id IN (
  'cmusg75rh000306p3nxzren30',
  'cmv3vfypr000506l80f9ff4ew',
  'cmv4ztvu1000l06l5vqu7cbgf',
  'cmv52p9o8002206jjiiwepdhx',
  'cmv5twfys000a06l4ibebwxcj',
  'cmv5v65ni000j06kznc7aggfx',
  'cmv6zi2go000706jsvtsahzhl',
  'cmv74qx96002806l58u804yvq',
  'cmv7dxm1u000c06jp0cbq78qn',
  'cmv7ka6sx000j06l3chjisvsz',
  'cmv7ykjjw000b06jo0h1t1b3g'
);
-- Expect: every row workspace slug = houzzat

-- ---------------------------------------------------------------------------
-- 1) BACKUP / EXPORT (run first; store results securely)
-- ---------------------------------------------------------------------------
-- Replace :lead_ids / use the IN list. Export each result set to JSON/CSV.

-- 1a Leads
SELECT * FROM "Lead"
WHERE id IN (
  'cmusg75rh000306p3nxzren30','cmv3vfypr000506l80f9ff4ew','cmv4ztvu1000l06l5vqu7cbgf',
  'cmv52p9o8002206jjiiwepdhx','cmv5twfys000a06l4ibebwxcj','cmv5v65ni000j06kznc7aggfx',
  'cmv6zi2go000706jsvtsahzhl','cmv74qx96002806l58u804yvq','cmv7dxm1u000c06jp0cbq78qn',
  'cmv7ka6sx000j06l3chjisvsz','cmv7ykjjw000b06jo0h1t1b3g'
)
AND "workspaceId" = 'cmt7kfcth0000gvu0bqsycsvz';

-- 1b Users (only those exclusively tied to these leads)
SELECT u.*
FROM "User" u
WHERE u.id IN (
  SELECT "customerId" FROM "Lead"
  WHERE id IN (
    'cmusg75rh000306p3nxzren30','cmv3vfypr000506l80f9ff4ew','cmv4ztvu1000l06l5vqu7cbgf',
    'cmv52p9o8002206jjiiwepdhx','cmv5twfys000a06l4ibebwxcj','cmv5v65ni000j06kznc7aggfx',
    'cmv6zi2go000706jsvtsahzhl','cmv74qx96002806l58u804yvq','cmv7dxm1u000c06jp0cbq78qn',
    'cmv7ka6sx000j06l3chjisvsz','cmv7ykjjw000b06jo0h1t1b3g'
  )
  AND "workspaceId" = 'cmt7kfcth0000gvu0bqsycsvz'
  AND "customerId" IS NOT NULL
)
AND u."workspaceId" = 'cmt7kfcth0000gvu0bqsycsvz';

-- 1c Dependencies
SELECT * FROM "LeadActivity" WHERE "leadId" IN (/* same lead ids */);
SELECT * FROM "Appointment" WHERE "leadId" IN (/* same lead ids */);
SELECT * FROM "AgentTask" WHERE "leadId" IN (/* same lead ids */);
SELECT * FROM "Conversation" WHERE "leadId" IN (/* same lead ids */);
SELECT * FROM "LeadNote" WHERE "leadId" IN (/* same lead ids */);
SELECT * FROM "LeadEmailLog" WHERE "leadId" IN (/* same lead ids */);
SELECT * FROM "LeadTag" WHERE "leadId" IN (/* same lead ids */);
SELECT * FROM "LeadOrigin" WHERE "leadId" IN (/* same lead ids */);

-- ---------------------------------------------------------------------------
-- 2) PRE-DELETE GUARDS (abort if any fail)
-- ---------------------------------------------------------------------------
-- 2a No messages in conversations
SELECT c.id, c."leadId", COUNT(m.id) AS message_count
FROM "Conversation" c
LEFT JOIN "Message" m ON m."conversationId" = c.id
WHERE c."leadId" IN (
  'cmusg75rh000306p3nxzren30','cmv3vfypr000506l80f9ff4ew','cmv4ztvu1000l06l5vqu7cbgf',
  'cmv52p9o8002206jjiiwepdhx','cmv5twfys000a06l4ibebwxcj','cmv5v65ni000j06kznc7aggfx',
  'cmv6zi2go000706jsvtsahzhl','cmv74qx96002806l58u804yvq','cmv7dxm1u000c06jp0cbq78qn',
  'cmv7ka6sx000j06l3chjisvsz','cmv7ykjjw000b06jo0h1t1b3g'
)
GROUP BY c.id, c."leadId"
HAVING COUNT(m.id) > 0;
-- Expect: 0 rows

-- 2b Users have no other leads
SELECT u.id, COUNT(l.id) AS lead_count
FROM "User" u
JOIN "Lead" l ON l."customerId" = u.id
WHERE u.id IN (
  SELECT "customerId" FROM "Lead"
  WHERE id IN (
    'cmusg75rh000306p3nxzren30','cmv3vfypr000506l80f9ff4ew','cmv4ztvu1000l06l5vqu7cbgf',
    'cmv52p9o8002206jjiiwepdhx','cmv5twfys000a06l4ibebwxcj','cmv5v65ni000j06kznc7aggfx',
    'cmv6zi2go000706jsvtsahzhl','cmv74qx96002806l58u804yvq','cmv7dxm1u000c06jp0cbq78qn',
    'cmv7ka6sx000j06l3chjisvsz','cmv7ykjjw000b06jo0h1t1b3g'
  )
)
GROUP BY u.id
HAVING COUNT(l.id) <> 1;
-- Expect: 0 rows

-- 2c Workspace isolation
SELECT COUNT(*)::int AS non_houzzat
FROM "Lead"
WHERE id IN (
  'cmusg75rh000306p3nxzren30','cmv3vfypr000506l80f9ff4ew','cmv4ztvu1000l06l5vqu7cbgf',
  'cmv52p9o8002206jjiiwepdhx','cmv5twfys000a06l4ibebwxcj','cmv5v65ni000j06kznc7aggfx',
  'cmv6zi2go000706jsvtsahzhl','cmv74qx96002806l58u804yvq','cmv7dxm1u000c06jp0cbq78qn',
  'cmv7ka6sx000j06l3chjisvsz','cmv7ykjjw000b06jo0h1t1b3g'
)
AND "workspaceId" IS DISTINCT FROM 'cmt7kfcth0000gvu0bqsycsvz';
-- Expect: 0

-- ---------------------------------------------------------------------------
-- 3) DELETION TRANSACTION (ONLY after backup + approval)
-- Order respects FKs. Uses explicit IDs + workspace predicate.
-- ---------------------------------------------------------------------------
-- BEGIN;
--
-- -- Capture user ids for this transaction
-- CREATE TEMP TABLE _sr_fake_leads ON COMMIT DROP AS
-- SELECT id AS lead_id, "customerId" AS user_id
-- FROM "Lead"
-- WHERE id IN (
--   'cmusg75rh000306p3nxzren30','cmv3vfypr000506l80f9ff4ew','cmv4ztvu1000l06l5vqu7cbgf',
--   'cmv52p9o8002206jjiiwepdhx','cmv5twfys000a06l4ibebwxcj','cmv5v65ni000j06kznc7aggfx',
--   'cmv6zi2go000706jsvtsahzhl','cmv74qx96002806l58u804yvq','cmv7dxm1u000c06jp0cbq78qn',
--   'cmv7ka6sx000j06l3chjisvsz','cmv7ykjjw000b06jo0h1t1b3g'
-- )
-- AND "workspaceId" = 'cmt7kfcth0000gvu0bqsycsvz';
--
-- -- Conversation subtree (empty messages expected)
-- DELETE FROM "MessageReaction"
-- WHERE "messageId" IN (
--   SELECT m.id FROM "Message" m
--   JOIN "Conversation" c ON c.id = m."conversationId"
--   JOIN _sr_fake_leads t ON t.lead_id = c."leadId"
-- );
-- DELETE FROM "MessageAttachment"
-- WHERE "messageId" IN (
--   SELECT m.id FROM "Message" m
--   JOIN "Conversation" c ON c.id = m."conversationId"
--   JOIN _sr_fake_leads t ON t.lead_id = c."leadId"
-- );
-- DELETE FROM "MessageRevision"
-- WHERE "messageId" IN (
--   SELECT m.id FROM "Message" m
--   JOIN "Conversation" c ON c.id = m."conversationId"
--   JOIN _sr_fake_leads t ON t.lead_id = c."leadId"
-- );
-- DELETE FROM "Message"
-- WHERE "conversationId" IN (
--   SELECT c.id FROM "Conversation" c JOIN _sr_fake_leads t ON t.lead_id = c."leadId"
-- );
-- DELETE FROM "Conversation"
-- WHERE "leadId" IN (SELECT lead_id FROM _sr_fake_leads);
--
-- DELETE FROM "LeadActivity" WHERE "leadId" IN (SELECT lead_id FROM _sr_fake_leads);
-- DELETE FROM "LeadNote" WHERE "leadId" IN (SELECT lead_id FROM _sr_fake_leads);
-- DELETE FROM "LeadEmailLog" WHERE "leadId" IN (SELECT lead_id FROM _sr_fake_leads);
-- DELETE FROM "LeadTag" WHERE "leadId" IN (SELECT lead_id FROM _sr_fake_leads);
-- DELETE FROM "LeadOrigin" WHERE "leadId" IN (SELECT lead_id FROM _sr_fake_leads);
-- DELETE FROM "Appointment" WHERE "leadId" IN (SELECT lead_id FROM _sr_fake_leads);
-- DELETE FROM "AgentTask" WHERE "leadId" IN (SELECT lead_id FROM _sr_fake_leads);
-- DELETE FROM "ViewingTourStop" WHERE "tourId" IN (
--   SELECT id FROM "ViewingTour" WHERE "leadId" IN (SELECT lead_id FROM _sr_fake_leads)
-- );
-- DELETE FROM "ViewingTour" WHERE "leadId" IN (SELECT lead_id FROM _sr_fake_leads);
-- DELETE FROM "CmaReport" WHERE "leadId" IN (SELECT lead_id FROM _sr_fake_leads);
--
-- DELETE FROM "Lead"
-- WHERE id IN (SELECT lead_id FROM _sr_fake_leads)
--   AND "workspaceId" = 'cmt7kfcth0000gvu0bqsycsvz';
--
-- -- Users only if still orphaned (no remaining leads) and Houzzat workspace
-- DELETE FROM "Session" WHERE "userId" IN (SELECT user_id FROM _sr_fake_leads WHERE user_id IS NOT NULL);
-- DELETE FROM "Account" WHERE "userId" IN (SELECT user_id FROM _sr_fake_leads WHERE user_id IS NOT NULL);
-- DELETE FROM "PushDevice" WHERE "userId" IN (SELECT user_id FROM _sr_fake_leads WHERE user_id IS NOT NULL);
-- DELETE FROM "SavedListing" WHERE "userId" IN (SELECT user_id FROM _sr_fake_leads WHERE user_id IS NOT NULL);
-- DELETE FROM "SavedSearch" WHERE "userId" IN (SELECT user_id FROM _sr_fake_leads WHERE user_id IS NOT NULL);
-- DELETE FROM "PropertyMonitor" WHERE "userId" IN (SELECT user_id FROM _sr_fake_leads WHERE user_id IS NOT NULL);
-- DELETE FROM "AreaMonitor" WHERE "userId" IN (SELECT user_id FROM _sr_fake_leads WHERE user_id IS NOT NULL);
--
-- DELETE FROM "User" u
-- WHERE u.id IN (SELECT user_id FROM _sr_fake_leads WHERE user_id IS NOT NULL)
--   AND u."workspaceId" = 'cmt7kfcth0000gvu0bqsycsvz'
--   AND NOT EXISTS (SELECT 1 FROM "Lead" l WHERE l."customerId" = u.id)
--   AND u.role = 'BUYER'
--   AND u.password IS NULL
--   AND u."emailVerified" IS NULL;
--
-- COMMIT;
--
-- ---------------------------------------------------------------------------
-- 4) POST-DELETE VERIFY
-- ---------------------------------------------------------------------------
-- SELECT COUNT(*) FROM "Lead" WHERE id IN (/* approved ids */);  -- expect 0
-- SELECT COUNT(*) FROM "User" WHERE id IN (/* approved user ids */); -- expect 0
