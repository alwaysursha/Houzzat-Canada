/**
 * Stage 6.11E.4 — Team Profile + Team Member OWNER operations.
 * Callers invoke through route handlers; authority is enforced here via
 * requireHostBoundOwnerOnboardingContext (hostname → ACTIVE OWNER).
 *
 * Neon HTTP-safe: no Prisma interactive transactions, no updateMany.
 * Leader: clear-then-hide / clear-then-delete (Restrict fail-closed).
 * photoUrl is never writable via generic create/update — Stage 6.11E.5
 * dedicated upload/remove APIs own managed photo storage.
 */

import { Prisma, type PrismaClient } from "@prisma/client";
import {
  OwnerActivationError,
  requireHostBoundOwnerOnboardingContext,
  type HostBoundOwnerOnboardingContext,
} from "@/lib/platform/activation";
import { prisma as defaultPrisma } from "@/lib/prisma";
import { TEAM_MEMBER_SORT_STEP } from "@/lib/tenancy/team-roster/limits";
import {
  BrandingStorageNotConfiguredError,
  buildTeamMemberPhotoObjectKey,
  deletePreviousManagedTeamMemberPhoto,
  newTeamMemberPhotoAssetId,
  putTeamMemberPhotoObject,
  validateTeamMemberPhotoBytes,
} from "@/lib/tenancy/team-roster/photo";
import {
  assertTeamMemberPublishable,
  normalizeAboutText,
  normalizeServiceAreas,
  normalizeTeamMemberWriteFields,
  parseServiceAreasFromDb,
} from "@/lib/tenancy/team-roster/validate";

type AuthInput = {
  request: Request;
  clientWorkspaceId?: string | null;
  prisma?: PrismaClient;
  hostDeps?: Parameters<
    typeof requireHostBoundOwnerOnboardingContext
  >[0]["hostDeps"];
  userId?: string;
};

export type PublicTeamProfileDto = {
  workspaceId: string;
  aboutText: string | null;
  serviceAreas: string[];
  leaderMemberId: string | null;
  updatedAt: string;
};

export type PublicTeamMemberDto = {
  id: string;
  workspaceId: string;
  name: string | null;
  designation: string | null;
  photoUrl: string | null;
  cellPhone: string | null;
  email: string | null;
  bio: string | null;
  sortOrder: number;
  isVisible: boolean;
  isLeader: boolean;
  createdAt: string;
  updatedAt: string;
};

function toProfileDto(row: {
  workspaceId: string;
  aboutText: string | null;
  serviceAreas: Prisma.JsonValue | null;
  leaderMemberId: string | null;
  updatedAt: Date;
}): PublicTeamProfileDto {
  return {
    workspaceId: row.workspaceId,
    aboutText: row.aboutText,
    serviceAreas: parseServiceAreasFromDb(row.serviceAreas),
    leaderMemberId: row.leaderMemberId,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toMemberDto(
  row: {
    id: string;
    workspaceId: string;
    name: string | null;
    designation: string | null;
    photoUrl: string | null;
    cellPhone: string | null;
    email: string | null;
    bio: string | null;
    sortOrder: number;
    isVisible: boolean;
    createdAt: Date;
    updatedAt: Date;
  },
  leaderMemberId: string | null,
): PublicTeamMemberDto {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    designation: row.designation,
    photoUrl: row.photoUrl,
    cellPhone: row.cellPhone,
    email: row.email,
    bio: row.bio,
    sortOrder: row.sortOrder,
    isVisible: row.isVisible,
    isLeader: leaderMemberId != null && leaderMemberId === row.id,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function auth(input: AuthInput): Promise<{
  ctx: HostBoundOwnerOnboardingContext;
  db: PrismaClient;
}> {
  const db = input.prisma ?? defaultPrisma;
  const ctx = await requireHostBoundOwnerOnboardingContext({
    request: input.request,
    prisma: db,
    hostDeps: input.hostDeps,
    userId: input.userId,
    clientWorkspaceId: input.clientWorkspaceId,
  });
  return { ctx, db };
}

/** Ensure 1:1 profile row exists (idempotent create). */
async function ensureTeamProfile(db: PrismaClient, workspaceId: string) {
  const existing = await db.workspaceTeamProfile.findUnique({
    where: { workspaceId },
  });
  if (existing) return existing;
  return db.workspaceTeamProfile.create({
    data: { workspaceId },
  });
}

/** Generic fail-closed for missing / cross-tenant member. */
function memberNotFound(): never {
  throw new OwnerActivationError("Team member not found", "NOT_FOUND", 404);
}

async function loadMemberOrThrow(
  db: PrismaClient,
  workspaceId: string,
  memberId: string,
) {
  const member = await db.workspaceTeamMember.findFirst({
    where: { id: memberId, workspaceId },
  });
  if (!member) memberNotFound();
  return member;
}

export async function getOwnerTeamProfile(input: AuthInput) {
  const { ctx, db } = await auth(input);
  const row = await ensureTeamProfile(db, ctx.workspaceId);
  return toProfileDto(row);
}

export async function updateOwnerTeamProfile(
  input: AuthInput & {
    aboutText?: unknown;
    serviceAreas?: unknown;
  },
) {
  const { ctx, db } = await auth(input);
  await ensureTeamProfile(db, ctx.workspaceId);

  const data: Prisma.WorkspaceTeamProfileUpdateInput = {};
  if ("aboutText" in input) {
    data.aboutText = normalizeAboutText(input.aboutText);
  }
  if ("serviceAreas" in input) {
    const areas = normalizeServiceAreas(input.serviceAreas);
    data.serviceAreas = areas === null ? Prisma.DbNull : areas;
  }

  if (Object.keys(data).length === 0) {
    throw new OwnerActivationError(
      "No Team Profile fields to update",
      "NO_FIELDS",
      400,
    );
  }

  const row = await db.workspaceTeamProfile.update({
    where: { workspaceId: ctx.workspaceId },
    data,
  });
  return toProfileDto(row);
}

export async function listOwnerTeamMembers(input: AuthInput) {
  const { ctx, db } = await auth(input);
  const profile = await ensureTeamProfile(db, ctx.workspaceId);
  const members = await db.workspaceTeamMember.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return {
    profile: toProfileDto(profile),
    members: members.map((m) => toMemberDto(m, profile.leaderMemberId)),
  };
}

export async function createOwnerTeamMember(
  input: AuthInput & { body: Record<string, unknown> },
) {
  const { ctx, db } = await auth(input);
  await ensureTeamProfile(db, ctx.workspaceId);
  const fields = normalizeTeamMemberWriteFields(input.body, "create");

  const maxSort = await db.workspaceTeamMember.findFirst({
    where: { workspaceId: ctx.workspaceId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder =
    maxSort != null ? maxSort.sortOrder + TEAM_MEMBER_SORT_STEP : 0;

  const member = await db.workspaceTeamMember.create({
    data: {
      workspaceId: ctx.workspaceId,
      name: fields.name ?? null,
      designation: fields.designation ?? null,
      cellPhone: fields.cellPhone ?? null,
      email: fields.email ?? null,
      bio: fields.bio ?? null,
      photoUrl: null,
      sortOrder,
      isVisible: false,
    },
  });

  const profile = await db.workspaceTeamProfile.findUniqueOrThrow({
    where: { workspaceId: ctx.workspaceId },
  });
  return toMemberDto(member, profile.leaderMemberId);
}

export async function getOwnerTeamMember(
  input: AuthInput & { memberId: string },
) {
  const { ctx, db } = await auth(input);
  const profile = await ensureTeamProfile(db, ctx.workspaceId);
  const member = await loadMemberOrThrow(db, ctx.workspaceId, input.memberId);
  return toMemberDto(member, profile.leaderMemberId);
}

export async function updateOwnerTeamMember(
  input: AuthInput & { memberId: string; body: Record<string, unknown> },
) {
  const { ctx, db } = await auth(input);
  await loadMemberOrThrow(db, ctx.workspaceId, input.memberId);
  const fields = normalizeTeamMemberWriteFields(input.body, "update");
  if (Object.keys(fields).length === 0) {
    throw new OwnerActivationError(
      "No Team Member fields to update",
      "NO_FIELDS",
      400,
    );
  }

  const member = await db.workspaceTeamMember.update({
    where: { id: input.memberId },
    data: fields,
  });
  const profile = await db.workspaceTeamProfile.findUniqueOrThrow({
    where: { workspaceId: ctx.workspaceId },
  });
  return toMemberDto(member, profile.leaderMemberId);
}

/**
 * Show member — requires publication fields including canonical photo.
 */
export async function showOwnerTeamMember(
  input: AuthInput & { memberId: string },
) {
  const { ctx, db } = await auth(input);
  const member = await loadMemberOrThrow(db, ctx.workspaceId, input.memberId);
  assertTeamMemberPublishable({
    id: member.id,
    workspaceId: member.workspaceId,
    name: member.name,
    designation: member.designation,
    photoUrl: member.photoUrl,
  });

  const updated = await db.workspaceTeamMember.update({
    where: { id: member.id },
    data: { isVisible: true },
  });
  const profile = await db.workspaceTeamProfile.findUniqueOrThrow({
    where: { workspaceId: ctx.workspaceId },
  });
  return toMemberDto(updated, profile.leaderMemberId);
}

/**
 * Hide member. If current leader → clear leader then hide (sequential).
 */
export async function hideOwnerTeamMember(
  input: AuthInput & { memberId: string },
) {
  const { ctx, db } = await auth(input);
  const member = await loadMemberOrThrow(db, ctx.workspaceId, input.memberId);
  const profile = await ensureTeamProfile(db, ctx.workspaceId);

  if (profile.leaderMemberId === member.id) {
    await db.workspaceTeamProfile.update({
      where: { workspaceId: ctx.workspaceId },
      data: { leaderMemberId: null },
    });
  }

  const updated = await db.workspaceTeamMember.update({
    where: { id: member.id },
    data: { isVisible: false },
  });
  const nextProfile = await db.workspaceTeamProfile.findUniqueOrThrow({
    where: { workspaceId: ctx.workspaceId },
  });
  return toMemberDto(updated, nextProfile.leaderMemberId);
}

/**
 * Delete member. If current leader → clear then delete (Restrict fail-closed).
 */
export async function removeOwnerTeamMember(
  input: AuthInput & { memberId: string },
) {
  const { ctx, db } = await auth(input);
  const member = await loadMemberOrThrow(db, ctx.workspaceId, input.memberId);
  const profile = await ensureTeamProfile(db, ctx.workspaceId);

  if (profile.leaderMemberId === member.id) {
    await db.workspaceTeamProfile.update({
      where: { workspaceId: ctx.workspaceId },
      data: { leaderMemberId: null },
    });
  }

  await db.workspaceTeamMember.delete({
    where: { id: member.id },
  });
  return { deleted: true as const, id: member.id };
}

export async function setOwnerTeamLeader(
  input: AuthInput & { memberId: string },
) {
  const { ctx, db } = await auth(input);
  await ensureTeamProfile(db, ctx.workspaceId);
  const member = await loadMemberOrThrow(db, ctx.workspaceId, input.memberId);

  if (!member.isVisible) {
    throw new OwnerActivationError(
      "Team Leader must be a visible member",
      "LEADER_NOT_VISIBLE",
      400,
    );
  }
  assertTeamMemberPublishable({
    id: member.id,
    workspaceId: member.workspaceId,
    name: member.name,
    designation: member.designation,
    photoUrl: member.photoUrl,
  });

  const profile = await db.workspaceTeamProfile.update({
    where: { workspaceId: ctx.workspaceId },
    data: { leaderMemberId: member.id },
  });
  return {
    profile: toProfileDto(profile),
    leader: toMemberDto(member, profile.leaderMemberId),
  };
}

export async function clearOwnerTeamLeader(input: AuthInput) {
  const { ctx, db } = await auth(input);
  await ensureTeamProfile(db, ctx.workspaceId);
  const profile = await db.workspaceTeamProfile.update({
    where: { workspaceId: ctx.workspaceId },
    data: { leaderMemberId: null },
  });
  return { profile: toProfileDto(profile) };
}

/**
 * Deterministic reorder: sequential sortOrder updates (0, 10, 20, …).
 * Rejects duplicates and IDs outside the host workspace.
 */
export async function reorderOwnerTeamMembers(
  input: AuthInput & { orderedIds: unknown },
) {
  const { ctx, db } = await auth(input);
  if (!Array.isArray(input.orderedIds)) {
    throw new OwnerActivationError(
      "orderedIds must be an array of member ids",
      "INVALID_ORDER",
      400,
    );
  }
  const orderedIds = input.orderedIds.map((id) => {
    if (typeof id !== "string" || !id.trim()) {
      throw new OwnerActivationError(
        "orderedIds must contain non-empty string ids",
        "INVALID_ORDER",
        400,
      );
    }
    return id.trim();
  });

  if (new Set(orderedIds).size !== orderedIds.length) {
    throw new OwnerActivationError(
      "orderedIds must not contain duplicates",
      "DUPLICATE_ORDER_IDS",
      400,
    );
  }

  const existing = await db.workspaceTeamMember.findMany({
    where: { workspaceId: ctx.workspaceId },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((m) => m.id));

  if (orderedIds.length !== existingIds.size) {
    throw new OwnerActivationError(
      "orderedIds must include every Team member exactly once",
      "INVALID_ORDER",
      400,
    );
  }
  for (const id of orderedIds) {
    if (!existingIds.has(id)) {
      // Fail closed — do not reveal whether id exists elsewhere.
      throw new OwnerActivationError(
        "orderedIds contains an invalid member id",
        "INVALID_ORDER",
        400,
      );
    }
  }

  for (let i = 0; i < orderedIds.length; i++) {
    await db.workspaceTeamMember.update({
      where: { id: orderedIds[i]! },
      data: { sortOrder: i * TEAM_MEMBER_SORT_STEP },
    });
  }

  return listOwnerTeamMembers(input);
}

/**
 * Stage 6.11E.5 — upload / replace Team member photo.
 * photoUrl is only writable through this path (not generic create/update).
 */
export async function uploadOwnerTeamMemberPhoto(
  input: AuthInput & { memberId: string; file: File },
) {
  const { ctx, db } = await auth(input);
  const member = await loadMemberOrThrow(db, ctx.workspaceId, input.memberId);
  const previousUrl = member.photoUrl;

  const buffer = await input.file.arrayBuffer();
  const validated = validateTeamMemberPhotoBytes(buffer);
  if ("code" in validated) {
    throw new OwnerActivationError(
      validated.message,
      validated.code,
      400,
    );
  }

  const uniqueId = newTeamMemberPhotoAssetId();
  const objectKey = buildTeamMemberPhotoObjectKey({
    workspaceId: ctx.workspaceId,
    memberId: member.id,
    uniqueId,
    ext: validated.ext,
  });

  const put = await putTeamMemberPhotoObject({
    objectKey,
    bytes: validated.bytes,
    contentType: validated.mime,
  }).catch((error: unknown) => {
    if (error instanceof BrandingStorageNotConfiguredError) {
      throw new OwnerActivationError(
        error.message,
        error.code,
        error.status,
      );
    }
    throw error;
  });

  const updated = await db.workspaceTeamMember.update({
    where: { id: member.id },
    data: { photoUrl: put.publicUrl },
  });

  // Best-effort delete previous managed asset after successful persist.
  await deletePreviousManagedTeamMemberPhoto({
    url: previousUrl,
    workspaceId: ctx.workspaceId,
    memberId: member.id,
  });

  const profile = await db.workspaceTeamProfile.findUniqueOrThrow({
    where: { workspaceId: ctx.workspaceId },
  });
  return toMemberDto(updated, profile.leaderMemberId);
}

/**
 * Stage 6.11E.5 — clear Team member photoUrl + best-effort managed object delete.
 */
export async function removeOwnerTeamMemberPhoto(
  input: AuthInput & { memberId: string },
) {
  const { ctx, db } = await auth(input);
  const member = await loadMemberOrThrow(db, ctx.workspaceId, input.memberId);
  const previousUrl = member.photoUrl;

  const updated = await db.workspaceTeamMember.update({
    where: { id: member.id },
    data: { photoUrl: null },
  });

  await deletePreviousManagedTeamMemberPhoto({
    url: previousUrl,
    workspaceId: ctx.workspaceId,
    memberId: member.id,
  });

  const profile = await db.workspaceTeamProfile.findUniqueOrThrow({
    where: { workspaceId: ctx.workspaceId },
  });
  return toMemberDto(updated, profile.leaderMemberId);
}
