/**
 * Phase 3A — shared agent photo resolver selftest.
 * Run: pnpm agent-photo:selftest
 *
 * Hermetic. No DB. No network.
 */
import assert from "node:assert/strict";
import {
  resolveAgentPhoto,
  resolvePersonalAgentPhoto,
  resolvePublicPrimaryAgentPhoto,
  sanitizePublicHttpsImageUrl,
  verifiedActiveMembership,
  type VerifiedActiveMembership,
} from "@/lib/tenancy/agent-photo";

const WS = "ws_photo_a";
const WS_B = "ws_photo_b";
const PRIMARY = "user_primary";
const AGENT = "user_agent";
const OWNER = "user_owner";
const NEXT_PRIMARY = "user_next_primary";

const CDN_PRIMARY =
  "https://cdn.example.com/workspaces/ws_photo_a/agent-user/user_primary.jpg";
const CDN_AGENT =
  "https://cdn.example.com/workspaces/ws_photo_a/agent-user/user_agent.jpg";
const CDN_BRANDING =
  "https://cdn.example.com/workspaces/ws_photo_a/branding/agent-profile.jpg";
const CDN_OWNER =
  "https://cdn.example.com/workspaces/ws_photo_a/agent-user/user_owner.jpg";
const CDN_NEXT =
  "https://cdn.example.com/workspaces/ws_photo_a/agent-user/user_next_primary.jpg";
const HOUZZAT_BRANDING_CDN =
  "https://branding-assets.houzzatpro.com/workspaces/example/branding/agent-profile.jpg";

function active(
  workspaceId: string,
  userId: string,
): ReturnType<typeof verifiedActiveMembership> {
  return verifiedActiveMembership(
    { workspaceId, userId, status: "ACTIVE" },
    { workspaceId, userId },
  );
}

function section(name: string) {
  console.log(`  ✓ ${name}`);
}

function assertRejected(url: string, label: string) {
  assert.equal(
    sanitizePublicHttpsImageUrl(url),
    null,
    `expected reject: ${label}`,
  );
}

function assertAccepted(url: string, label: string) {
  assert.equal(
    sanitizePublicHttpsImageUrl(url),
    url.trim(),
    `expected accept: ${label}`,
  );
}

// ---------------------------------------------------------------------------
// URL sanitizer — valid public HTTPS
// ---------------------------------------------------------------------------

{
  assertAccepted(CDN_PRIMARY, "valid HTTPS CDN");
  assertAccepted(
    `  ${CDN_PRIMARY}  `,
    "leading/trailing spaces only (non-control)",
  );
  assert.equal(
    sanitizePublicHttpsImageUrl(`  ${CDN_PRIMARY}  `),
    CDN_PRIMARY,
  );
  assertAccepted(HOUZZAT_BRANDING_CDN, "Houzzat branding CDN");
  assertAccepted("https://8.8.8.8/photo.jpg", "public IPv4");
  assertAccepted(
    "https://[2001:4860:4860::8888]/photo.jpg",
    "public IPv6",
  );
  section("Valid public HTTPS URLs + Houzzat CDN");
}

// ---------------------------------------------------------------------------
// URL sanitizer — missing / schemes / credentials / malformed
// ---------------------------------------------------------------------------

{
  assert.equal(sanitizePublicHttpsImageUrl(null), null);
  assert.equal(sanitizePublicHttpsImageUrl(undefined), null);
  assert.equal(sanitizePublicHttpsImageUrl(""), null);
  assert.equal(sanitizePublicHttpsImageUrl("   "), null);
  assertRejected("not-a-url", "malformed");
  assertRejected("http://cdn.example.com/photo.jpg", "http");
  assertRejected("javascript:alert(1)", "javascript:");
  assertRejected("data:image/png;base64,AAAA", "data:");
  assertRejected("ftp://cdn.example.com/photo.jpg", "ftp");
  assertRejected(
    "https://user:pass@cdn.example.com/photo.jpg",
    "embedded credentials",
  );
  assertRejected(
    "https://%75ser@cdn.example.com/a.jpg",
    "encoded userinfo credentials",
  );
  section("Missing / invalid schemes / credentials / malformed");
}

// ---------------------------------------------------------------------------
// URL sanitizer — ASCII control characters
// ---------------------------------------------------------------------------

{
  assertRejected(`https://cdn.example.com/a.jpg\u0000`, "NUL in URL");
  assertRejected(`https://cdn.example.com/\tphoto.jpg`, "TAB in path");
  assertRejected(`https://cdn.example.com/a.jpg\r`, "trailing CR");
  assertRejected(`https://cdn.example.com/a.jpg\n`, "trailing LF");
  assertRejected(`\nhttps://cdn.example.com/a.jpg`, "leading LF");
  assertRejected(`\thttps://cdn.example.com/a.jpg`, "leading TAB");
  assertRejected(`https://cdn.example.com/a.jpg\u007f`, "DEL");
  section("NUL, TAB, CR, LF and other ASCII controls rejected");
}

// ---------------------------------------------------------------------------
// URL sanitizer — localhost / loopback / private / link-local
// ---------------------------------------------------------------------------

{
  assertRejected("https://localhost/photo.jpg", "localhost");
  assertRejected("https://foo.localhost/photo.jpg", "localhost subdomain");
  assertRejected("https://LocalHost/photo.jpg", "localhost case");

  assertRejected("https://127.0.0.1/photo.jpg", "127.0.0.1");
  assertRejected("https://127.1/photo.jpg", "127.1 alternate → loopback");
  assertRejected("https://0177.0.0.1/photo.jpg", "octal alternate → loopback");
  assertRejected("https://0x7f.0.0.1/photo.jpg", "hex alternate → loopback");
  assertRejected("https://2130706433/photo.jpg", "dword alternate → loopback");

  assertRejected("https://0.0.0.0/photo.jpg", "0.0.0.0");
  assertRejected("https://0/photo.jpg", "0 alternate → 0.0.0.0");

  assertRejected("https://10.0.0.1/photo.jpg", "private 10/8");
  assertRejected("https://172.16.0.1/photo.jpg", "private 172.16/12 low");
  assertRejected("https://172.31.255.255/photo.jpg", "private 172.16/12 high");
  assert.equal(
    sanitizePublicHttpsImageUrl("https://172.32.0.1/photo.jpg"),
    "https://172.32.0.1/photo.jpg",
    "172.32 is not private",
  );
  assertRejected("https://192.168.1.1/photo.jpg", "private 192.168/16");
  assertRejected("https://100.64.0.1/photo.jpg", "CGNAT 100.64/10");

  assertRejected(
    "https://169.254.169.254/latest/meta-data",
    "link-local metadata",
  );
  assertRejected("https://169.254.1.1/photo.jpg", "link-local");

  assertRejected("https://[::1]/photo.jpg", "IPv6 loopback");
  assertRejected("https://[::]/photo.jpg", "IPv6 unspecified");
  assertRejected(
    "https://[::ffff:127.0.0.1]/photo.jpg",
    "IPv4-mapped loopback",
  );
  assertRejected(
    "https://[::ffff:7f00:1]/photo.jpg",
    "IPv4-mapped loopback hex",
  );
  assertRejected("https://[fe80::1]/photo.jpg", "IPv6 link-local");
  assertRejected("https://[fc00::1]/photo.jpg", "IPv6 unique local fc");
  assertRejected(
    "https://[fd12:3456:789a::1]/photo.jpg",
    "IPv6 unique local fd",
  );
  assertRejected("https://[ff02::1]/photo.jpg", "IPv6 multicast");
  section("Localhost / loopback / private / link-local / IPv6 non-public");
}

// ---------------------------------------------------------------------------
// PERSONAL policy
// ---------------------------------------------------------------------------

{
  const membership = active(WS, AGENT);
  assert.ok(membership);

  assert.equal(
    resolvePersonalAgentPhoto({
      workspaceId: WS,
      userId: AGENT,
      userImage: CDN_AGENT,
      membership,
    }),
    CDN_AGENT,
  );
  section("PERSONAL: ACTIVE member with User.image");

  assert.equal(
    resolvePersonalAgentPhoto({
      workspaceId: WS,
      userId: AGENT,
      userImage: null,
      membership,
    }),
    null,
  );
  assert.equal(
    resolvePersonalAgentPhoto({
      workspaceId: WS,
      userId: AGENT,
      userImage: "http://insecure.example.com/x.jpg",
      membership,
    }),
    null,
  );
  section("PERSONAL: missing / invalid photo → null");

  assert.equal(
    resolvePersonalAgentPhoto({
      workspaceId: WS,
      userId: AGENT,
      userImage: CDN_AGENT,
      membership: verifiedActiveMembership(
        { workspaceId: WS, userId: AGENT, status: "SUSPENDED" },
        { workspaceId: WS, userId: AGENT },
      ),
    }),
    null,
  );
  assert.equal(
    resolvePersonalAgentPhoto({
      workspaceId: WS,
      userId: AGENT,
      userImage: CDN_AGENT,
      membership: verifiedActiveMembership(
        { workspaceId: WS_B, userId: AGENT, status: "ACTIVE" },
        { workspaceId: WS, userId: AGENT },
      ),
    }),
    null,
    "cross-workspace membership rejected at mint",
  );
  assert.equal(
    resolvePersonalAgentPhoto({
      workspaceId: WS,
      userId: AGENT,
      userImage: CDN_AGENT,
      membership: null,
    }),
    null,
  );
  section("PERSONAL: inactive or cross-workspace membership → null");

  assert.equal(
    resolvePersonalAgentPhoto({
      workspaceId: WS,
      userId: AGENT,
      userImage: null,
      membership,
    }),
    null,
  );
  section("PERSONAL: non-primary never inherits primary / branding photo");
}

// ---------------------------------------------------------------------------
// Membership mint contract — forgery / mismatch
// ---------------------------------------------------------------------------

{
  const minted = active(WS, AGENT);
  assert.ok(minted);

  // Structural forgery (TypeScript-shaped object without mint) must fail closed.
  const forged = {
    workspaceId: WS,
    userId: AGENT,
    status: "ACTIVE",
  } as VerifiedActiveMembership;
  assert.equal(
    resolvePersonalAgentPhoto({
      workspaceId: WS,
      userId: AGENT,
      userImage: CDN_AGENT,
      membership: forged,
    }),
    null,
    "forged structural membership rejected",
  );

  // Spread copy is a different object — not in the mint WeakSet.
  const spreadCopy = { ...minted } as VerifiedActiveMembership;
  assert.equal(
    resolvePersonalAgentPhoto({
      workspaceId: WS,
      userId: AGENT,
      userImage: CDN_AGENT,
      membership: spreadCopy,
    }),
    null,
    "spread copy of minted token rejected",
  );

  // Minted token reused for a different user/workspace fails closed.
  assert.equal(
    resolvePersonalAgentPhoto({
      workspaceId: WS,
      userId: PRIMARY,
      userImage: CDN_PRIMARY,
      membership: minted,
    }),
    null,
    "minted token cannot authorize a different user",
  );
  assert.equal(
    resolvePersonalAgentPhoto({
      workspaceId: WS_B,
      userId: AGENT,
      userImage: CDN_AGENT,
      membership: minted,
    }),
    null,
    "minted token cannot authorize a different workspace",
  );

  // Cross-tenant PUBLIC_PRIMARY membership mismatch → branding only / null.
  assert.equal(
    resolvePublicPrimaryAgentPhoto({
      workspaceId: WS,
      primaryAgentId: PRIMARY,
      primaryUserImage: CDN_PRIMARY,
      primaryMembership: verifiedActiveMembership(
        { workspaceId: WS_B, userId: PRIMARY, status: "ACTIVE" },
        { workspaceId: WS, userId: PRIMARY },
      ),
      brandingAgentProfilePhotoUrl: null,
    }),
    null,
  );
  section("Forged / mismatched membership objects fail closed");
}

// ---------------------------------------------------------------------------
// PUBLIC_PRIMARY policy
// ---------------------------------------------------------------------------

{
  const primaryMem = active(WS, PRIMARY);
  assert.ok(primaryMem);

  assert.equal(
    resolvePublicPrimaryAgentPhoto({
      workspaceId: WS,
      primaryAgentId: PRIMARY,
      primaryUserImage: CDN_PRIMARY,
      primaryMembership: primaryMem,
      brandingAgentProfilePhotoUrl: CDN_BRANDING,
    }),
    CDN_PRIMARY,
  );
  section("PUBLIC_PRIMARY: primary with User.image");

  assert.equal(
    resolvePublicPrimaryAgentPhoto({
      workspaceId: WS,
      primaryAgentId: PRIMARY,
      primaryUserImage: null,
      primaryMembership: primaryMem,
      brandingAgentProfilePhotoUrl: CDN_BRANDING,
    }),
    null,
    "cleared User.image must not resurrect via branding",
  );
  assert.equal(
    resolvePublicPrimaryAgentPhoto({
      workspaceId: WS,
      primaryAgentId: PRIMARY,
      primaryUserImage: "javascript:evil",
      primaryMembership: primaryMem,
      brandingAgentProfilePhotoUrl: CDN_BRANDING,
    }),
    null,
    "unsafe User.image must not fall through to branding",
  );
  section("PUBLIC_PRIMARY: primary without User.image → null (no branding resurrect)");

  assert.equal(
    resolvePublicPrimaryAgentPhoto({
      workspaceId: WS,
      primaryAgentId: PRIMARY,
      primaryUserImage: null,
      primaryMembership: primaryMem,
      brandingAgentProfilePhotoUrl: HOUZZAT_BRANDING_CDN,
    }),
    null,
  );
  section("PUBLIC_PRIMARY: Houzzat CDN branding ignored when personal channel trusted");

  assert.equal(
    resolvePublicPrimaryAgentPhoto({
      workspaceId: WS,
      primaryAgentId: PRIMARY,
      primaryUserImage: CDN_PRIMARY,
      primaryMembership: verifiedActiveMembership(
        { workspaceId: WS, userId: PRIMARY, status: "INVITED" },
        { workspaceId: WS, userId: PRIMARY },
      ),
      brandingAgentProfilePhotoUrl: CDN_BRANDING,
    }),
    CDN_BRANDING,
  );
  section("PUBLIC_PRIMARY: inactive primary membership → branding");

  assert.equal(
    resolvePublicPrimaryAgentPhoto({
      workspaceId: WS,
      primaryAgentId: null,
      primaryUserImage: CDN_OWNER,
      primaryMembership: active(WS, OWNER),
      brandingAgentProfilePhotoUrl: CDN_BRANDING,
    }),
    CDN_BRANDING,
    "no primaryAgentId → branding only; OWNER image ignored",
  );
  assert.equal(
    resolvePublicPrimaryAgentPhoto({
      workspaceId: WS,
      primaryAgentId: null,
      primaryUserImage: CDN_OWNER,
      primaryMembership: active(WS, OWNER),
      brandingAgentProfilePhotoUrl: null,
    }),
    null,
    "no primary + no branding → null (do not invent OWNER)",
  );
  section("PUBLIC_PRIMARY: OWNER not automatically substituted");

  const nextMem = active(WS, NEXT_PRIMARY);
  assert.ok(nextMem);
  assert.equal(
    resolvePublicPrimaryAgentPhoto({
      workspaceId: WS,
      primaryAgentId: NEXT_PRIMARY,
      primaryUserImage: CDN_NEXT,
      primaryMembership: nextMem,
      brandingAgentProfilePhotoUrl: CDN_BRANDING,
    }),
    CDN_NEXT,
  );
  assert.equal(
    resolvePublicPrimaryAgentPhoto({
      workspaceId: WS,
      primaryAgentId: NEXT_PRIMARY,
      primaryUserImage: null,
      primaryMembership: nextMem,
      brandingAgentProfilePhotoUrl: CDN_BRANDING,
    }),
    null,
    "reassigned primary with no photo → null, not previous branding",
  );
  // Stale membership for previous primary must not expose previous User.image.
  assert.equal(
    resolvePublicPrimaryAgentPhoto({
      workspaceId: WS,
      primaryAgentId: NEXT_PRIMARY,
      primaryUserImage: CDN_PRIMARY,
      primaryMembership: primaryMem,
      brandingAgentProfilePhotoUrl: CDN_BRANDING,
    }),
    CDN_BRANDING,
  );
  section("PUBLIC_PRIMARY: primary agent reassignment");

  assert.equal(
    resolvePublicPrimaryAgentPhoto({
      workspaceId: WS,
      primaryAgentId: PRIMARY,
      primaryUserImage: CDN_PRIMARY,
      primaryMembership: verifiedActiveMembership(
        { workspaceId: WS_B, userId: PRIMARY, status: "ACTIVE" },
        { workspaceId: WS, userId: PRIMARY },
      ),
      brandingAgentProfilePhotoUrl: null,
    }),
    null,
  );
  section("PUBLIC_PRIMARY: cross-workspace membership rejected");
}

// ---------------------------------------------------------------------------
// Discriminated resolveAgentPhoto
// ---------------------------------------------------------------------------

{
  const mem = active(WS, AGENT);
  assert.ok(mem);
  assert.equal(
    resolveAgentPhoto("PERSONAL", {
      workspaceId: WS,
      userId: AGENT,
      userImage: CDN_AGENT,
      membership: mem,
    }),
    CDN_AGENT,
  );
  assert.equal(
    resolveAgentPhoto("PUBLIC_PRIMARY", {
      workspaceId: WS,
      primaryAgentId: PRIMARY,
      primaryUserImage: CDN_PRIMARY,
      primaryMembership: active(WS, PRIMARY),
      brandingAgentProfilePhotoUrl: CDN_BRANDING,
    }),
    CDN_PRIMARY,
  );
  section("resolveAgentPhoto discrimination");
}

console.log("\nagent-photo selftest: OK");
