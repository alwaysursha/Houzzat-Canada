/**
 * Phase 3A — shared agent photo URL resolution (server-safe).
 *
 * Canonical per-agent source: User.image
 * Legacy public portrait: WorkspaceBranding.agentProfilePhotoUrl
 * Public person: Workspace.primaryAgentId only (never OWNER by role)
 *
 * Callers must supply already-authorized membership / primary identity.
 * This module does not query the database and never invents a primary.
 */

export type AgentPhotoPolicy = "PERSONAL" | "PUBLIC_PRIMARY";

/**
 * Opaque ACTIVE-membership attestation for a workspace+user pair.
 * Construct only via {@link verifiedActiveMembership}. Structural copies
 * and plain objects are rejected at runtime (WeakSet mint registry).
 */
export type VerifiedActiveMembership = {
  readonly workspaceId: string;
  readonly userId: string;
  readonly status: "ACTIVE";
};

export type MembershipRowForPhoto = {
  workspaceId: string;
  userId: string;
  status: string;
};

/** Exact object references minted by {@link verifiedActiveMembership}. */
const mintedMembershipTokens = new WeakSet<object>();

function isMintedActiveMembership(
  value: unknown,
): value is VerifiedActiveMembership {
  if (value === null || typeof value !== "object") return false;
  if (!mintedMembershipTokens.has(value)) return false;
  const token = value as VerifiedActiveMembership;
  return (
    token.status === "ACTIVE" &&
    typeof token.workspaceId === "string" &&
    token.workspaceId.length > 0 &&
    typeof token.userId === "string" &&
    token.userId.length > 0
  );
}

/**
 * Build a verified ACTIVE membership token, or null when the row is not
 * ACTIVE / not scoped to the expected workspace+user.
 */
export function verifiedActiveMembership(
  row: MembershipRowForPhoto | null | undefined,
  expected: { workspaceId: string; userId: string },
): VerifiedActiveMembership | null {
  if (!row) return null;
  if (row.status !== "ACTIVE") return null;
  if (row.workspaceId !== expected.workspaceId) return null;
  if (row.userId !== expected.userId) return null;
  if (!expected.workspaceId.trim() || !expected.userId.trim()) return null;

  const token: VerifiedActiveMembership = Object.freeze({
    workspaceId: row.workspaceId,
    userId: row.userId,
    status: "ACTIVE",
  });
  mintedMembershipTokens.add(token);
  return token;
}

const MAX_IMAGE_URL_LENGTH = 2048;

/** ASCII C0 controls + DEL — rejected anywhere in the original input. */
function hasAsciiControlCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function parseIpv4Hostname(
  hostname: string,
): [number, number, number, number] | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!match) return null;
  const octets: [number, number, number, number] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    Number(match[4]),
  ];
  if (octets.some((octet) => octet > 255)) return null;
  return octets;
}

function isNonPublicIpv4(octets: [number, number, number, number]): boolean {
  const [a, b] = octets;
  // 0.0.0.0/8 unspecified / this-network
  if (a === 0) return true;
  // 10.0.0.0/8 private
  if (a === 10) return true;
  // 127.0.0.0/8 loopback
  if (a === 127) return true;
  // 169.254.0.0/16 link-local (incl. metadata 169.254.169.254)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12 private
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16 private
  if (a === 192 && b === 168) return true;
  // 100.64.0.0/10 shared address space (CGNAT)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 224.0.0.0/4 multicast and 240.0.0.0/4 reserved
  if (a >= 224) return true;
  return false;
}

/**
 * Parse IPv6 hostname (with or without brackets) into eight 16-bit groups.
 * Supports IPv4-mapped tails (e.g. ::ffff:7f00:1 after URL normalization).
 */
function parseIpv6Hostname(hostname: string): number[] | null {
  let host = hostname;
  if (host.startsWith("[") && host.endsWith("]")) {
    host = host.slice(1, -1);
  }
  if (!host) return null;

  const zoneIndex = host.indexOf("%");
  if (zoneIndex !== -1) {
    host = host.slice(0, zoneIndex);
  }

  // Reject IPv4-embedded dotted form here; URL parser normalizes mapped form.
  if (host.includes(".")) return null;

  const sides = host.split("::");
  if (sides.length > 2) return null;

  const parseSide = (side: string): number[] | null => {
    if (!side) return [];
    const parts = side.split(":");
    const groups: number[] = [];
    for (const part of parts) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(part)) return null;
      groups.push(Number.parseInt(part, 16));
    }
    return groups;
  };

  let groups: number[];
  if (sides.length === 1) {
    const parsed = parseSide(sides[0]!);
    if (!parsed || parsed.length !== 8) return null;
    groups = parsed;
  } else {
    const left = parseSide(sides[0]!);
    const right = parseSide(sides[1]!);
    if (!left || !right) return null;
    const missing = 8 - left.length - right.length;
    if (missing < 0) return null;
    groups = [...left, ...Array.from({ length: missing }, () => 0), ...right];
    if (groups.length !== 8) return null;
  }

  return groups;
}

function isNonPublicIpv6(groups: number[]): boolean {
  // Unspecified ::
  if (groups.every((g) => g === 0)) return true;
  // Loopback ::1
  if (
    groups[0] === 0 &&
    groups[1] === 0 &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0 &&
    groups[5] === 0 &&
    groups[6] === 0 &&
    groups[7] === 1
  ) {
    return true;
  }
  // IPv4-mapped ::ffff:x:x — apply IPv4 non-public rules to embedded address
  if (
    groups[0] === 0 &&
    groups[1] === 0 &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0 &&
    groups[5] === 0xffff
  ) {
    const hi = groups[6]!;
    const lo = groups[7]!;
    const octets: [number, number, number, number] = [
      (hi >> 8) & 0xff,
      hi & 0xff,
      (lo >> 8) & 0xff,
      lo & 0xff,
    ];
    return isNonPublicIpv4(octets);
  }
  // Link-local fe80::/10
  if ((groups[0]! & 0xffc0) === 0xfe80) return true;
  // Unique local fc00::/7
  if ((groups[0]! & 0xfe00) === 0xfc00) return true;
  // Multicast ff00::/8
  if ((groups[0]! & 0xff00) === 0xff00) return true;
  return false;
}

function isLocalhostHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "localhost" || host.endsWith(".localhost");
}

function isPublicHostname(hostname: string): boolean {
  if (!hostname) return false;
  if (isLocalhostHostname(hostname)) return false;

  const ipv4 = parseIpv4Hostname(hostname);
  if (ipv4) return !isNonPublicIpv4(ipv4);

  if (hostname.startsWith("[")) {
    const ipv6 = parseIpv6Hostname(hostname);
    if (!ipv6) return false;
    return !isNonPublicIpv6(ipv6);
  }

  // Domain names: reject empty labels / trailing dots already handled by URL.
  // Bare IPv6 without brackets is not a valid URL hostname in WHATWG.
  return true;
}

/**
 * Accept only safe public HTTPS image URLs. Rejects missing values,
 * non-HTTPS protocols, credentials-in-URL, control characters,
 * unparseable strings, and non-public/local destinations.
 */
export function sanitizePublicHttpsImageUrl(
  url: string | null | undefined,
): string | null {
  if (typeof url !== "string") return null;
  // Reject controls in the original input (do not trim them away first).
  if (hasAsciiControlCharacters(url)) return null;

  // trim() only removes spaces here (ASCII controls already rejected).
  const raw = url.trim();
  if (!raw || raw.length > MAX_IMAGE_URL_LENGTH) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) return null;
  if (!parsed.hostname) return null;
  if (!isPublicHostname(parsed.hostname)) return null;

  // Preserve the caller string when it is already a valid absolute HTTPS URL.
  return raw;
}

export type ResolvePersonalAgentPhotoInput = {
  workspaceId: string;
  userId: string;
  /** Canonical per-agent photo (User.image). */
  userImage: string | null | undefined;
  /**
   * Must be a {@link VerifiedActiveMembership} minted for this workspace+user.
   * Unverified or cross-workspace membership yields null (never branding).
   */
  membership: VerifiedActiveMembership | null;
};

/**
 * PERSONAL policy — photo for one specific agent in one workspace.
 * Never substitutes another agent's image or workspace branding.
 */
export function resolvePersonalAgentPhoto(
  input: ResolvePersonalAgentPhotoInput,
): string | null {
  const workspaceId = input.workspaceId.trim();
  const userId = input.userId.trim();
  if (!workspaceId || !userId) return null;

  const membership = input.membership;
  if (
    !isMintedActiveMembership(membership) ||
    membership.workspaceId !== workspaceId ||
    membership.userId !== userId
  ) {
    return null;
  }

  return sanitizePublicHttpsImageUrl(input.userImage);
}

export type ResolvePublicPrimaryAgentPhotoInput = {
  workspaceId: string;
  /** Authoritative Workspace.primaryAgentId — never inferred from OWNER. */
  primaryAgentId: string | null | undefined;
  /** User.image for the current primary agent (may be null). */
  primaryUserImage: string | null | undefined;
  /**
   * Minted ACTIVE membership for primaryAgentId in this workspace.
   * Required before User.image is trusted. Absent/inactive → branding fallback only.
   */
  primaryMembership: VerifiedActiveMembership | null;
  /** Legacy WorkspaceBranding.agentProfilePhotoUrl. */
  brandingAgentProfilePhotoUrl: string | null | undefined;
};

/**
 * PUBLIC_PRIMARY policy — workspace public portrait.
 *
 * Prefer the designated primary agent's valid User.image when they have
 * ACTIVE membership. Otherwise fall back to legacy branding portrait.
 * When primaryAgentId is absent, only the branding URL is considered
 * (legacy compatibility) — no person is inferred from branding.
 * Never treats OWNER as an implicit primary.
 */
export function resolvePublicPrimaryAgentPhoto(
  input: ResolvePublicPrimaryAgentPhotoInput,
): string | null {
  const workspaceId = input.workspaceId.trim();
  if (!workspaceId) return null;

  const primaryAgentId = input.primaryAgentId?.trim() || null;
  const brandingPhoto = sanitizePublicHttpsImageUrl(
    input.brandingAgentProfilePhotoUrl,
  );

  if (!primaryAgentId) {
    // No designated primary — preserve legacy branding only; do not invent a person.
    return brandingPhoto;
  }

  const membership = input.primaryMembership;
  const membershipOk =
    isMintedActiveMembership(membership) &&
    membership.workspaceId === workspaceId &&
    membership.userId === primaryAgentId;

  if (membershipOk) {
    const personal = sanitizePublicHttpsImageUrl(input.primaryUserImage);
    if (personal) return personal;
  }

  return brandingPhoto;
}

/**
 * Discriminated helper for callers that already know which policy they need.
 */
export function resolveAgentPhoto(
  policy: "PERSONAL",
  input: ResolvePersonalAgentPhotoInput,
): string | null;
export function resolveAgentPhoto(
  policy: "PUBLIC_PRIMARY",
  input: ResolvePublicPrimaryAgentPhotoInput,
): string | null;
export function resolveAgentPhoto(
  policy: AgentPhotoPolicy,
  input: ResolvePersonalAgentPhotoInput | ResolvePublicPrimaryAgentPhotoInput,
): string | null {
  switch (policy) {
    case "PERSONAL":
      return resolvePersonalAgentPhoto(input as ResolvePersonalAgentPhotoInput);
    case "PUBLIC_PRIMARY":
      return resolvePublicPrimaryAgentPhoto(
        input as ResolvePublicPrimaryAgentPhotoInput,
      );
    default: {
      const _exhaustive: never = policy;
      return _exhaustive;
    }
  }
}
