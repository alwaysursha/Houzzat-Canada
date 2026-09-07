/**
 * Stage 6.11E.4 — Team Profile / Member validation (publication + normalize).
 */

import { OwnerActivationError } from "@/lib/platform/activation/errors";
import {
  TEAM_ABOUT_TEXT_MAX,
  TEAM_MEMBER_BIO_MAX,
  TEAM_MEMBER_CELL_MAX,
  TEAM_MEMBER_DESIGNATION_MAX,
  TEAM_MEMBER_EMAIL_MAX,
  TEAM_MEMBER_NAME_MAX,
  TEAM_SERVICE_AREA_MAX_COUNT,
  TEAM_SERVICE_AREA_MAX_LENGTH,
} from "@/lib/tenancy/team-roster/limits";
import { isAcceptedTeamMemberPhotoUrl } from "@/lib/tenancy/team-roster/photo";

export type TeamMemberPublicationInput = {
  id?: string;
  workspaceId: string;
  name: string | null;
  designation: string | null;
  photoUrl: string | null;
  isVisible?: boolean;
};

export type TeamMemberPublicationResult =
  | { ok: true }
  | { ok: false; code: string; message: string; missing: string[] };

/**
 * Shared publication gate for show / set-leader / future completion / resolver.
 * Visible members require name + designation + canonical Team member photo.
 */
export function validateTeamMemberForPublication(
  member: TeamMemberPublicationInput,
): TeamMemberPublicationResult {
  const missing: string[] = [];
  const name = member.name?.trim() ?? "";
  const designation = member.designation?.trim() ?? "";
  const photoUrl = member.photoUrl?.trim() ?? "";

  if (!name) missing.push("name");
  if (!designation) missing.push("designation");
  if (!photoUrl) {
    missing.push("photoUrl");
  } else if (
    !isAcceptedTeamMemberPhotoUrl(
      photoUrl,
      member.workspaceId,
      member.id,
    )
  ) {
    return {
      ok: false,
      code: "TEAM_MEMBER_PHOTO_NOT_CANONICAL",
      message:
        "Team member photo must be a workspace Team member asset (upload via Website Setup).",
      missing: ["photoUrl"],
    };
  }

  if (missing.length > 0) {
    return {
      ok: false,
      code: "TEAM_MEMBER_INCOMPLETE",
      message: `Team member cannot be public until ${missing.join(", ")} ${
        missing.length === 1 ? "is" : "are"
      } set.`,
      missing,
    };
  }
  return { ok: true };
}

export function assertTeamMemberPublishable(
  member: TeamMemberPublicationInput,
): void {
  const result = validateTeamMemberForPublication(member);
  if (!result.ok) {
    throw new OwnerActivationError(result.message, result.code, 400);
  }
}

export function normalizeAboutText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new OwnerActivationError(
      "aboutText must be a string",
      "INVALID_ABOUT_TEXT",
      400,
    );
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > TEAM_ABOUT_TEXT_MAX) {
    throw new OwnerActivationError(
      `aboutText must be at most ${TEAM_ABOUT_TEXT_MAX} characters`,
      "ABOUT_TEXT_TOO_LONG",
      400,
    );
  }
  return trimmed;
}

/** Normalize serviceAreas to unique trimmed string[] (or null if empty). */
export function normalizeServiceAreas(value: unknown): string[] | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) {
    throw new OwnerActivationError(
      "serviceAreas must be a string array",
      "INVALID_SERVICE_AREAS",
      400,
    );
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      throw new OwnerActivationError(
        "serviceAreas entries must be strings",
        "INVALID_SERVICE_AREAS",
        400,
      );
    }
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (trimmed.length > TEAM_SERVICE_AREA_MAX_LENGTH) {
      throw new OwnerActivationError(
        `Each service area must be at most ${TEAM_SERVICE_AREA_MAX_LENGTH} characters`,
        "SERVICE_AREA_TOO_LONG",
        400,
      );
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length > TEAM_SERVICE_AREA_MAX_COUNT) {
      throw new OwnerActivationError(
        `At most ${TEAM_SERVICE_AREA_MAX_COUNT} service areas allowed`,
        "SERVICE_AREAS_TOO_MANY",
        400,
      );
    }
  }
  return out.length > 0 ? out : null;
}

function optionalTrimmed(
  value: unknown,
  field: string,
  max: number,
  code: string,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new OwnerActivationError(`${field} must be a string`, code, 400);
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) {
    throw new OwnerActivationError(
      `${field} must be at most ${max} characters`,
      code,
      400,
    );
  }
  return trimmed;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type NormalizedTeamMemberFields = {
  name?: string | null;
  designation?: string | null;
  cellPhone?: string | null;
  email?: string | null;
  bio?: string | null;
};

/** Normalize create/update member fields. Rejects photoUrl if present on input bag. */
export function normalizeTeamMemberWriteFields(
  body: Record<string, unknown>,
  mode: "create" | "update",
): NormalizedTeamMemberFields {
  if ("photoUrl" in body && body.photoUrl !== undefined) {
    throw new OwnerActivationError(
      "photoUrl cannot be set via this API; upload a Team member photo instead",
      "PHOTO_URL_NOT_WRITABLE",
      400,
    );
  }

  const name = optionalTrimmed(
    body.name,
    "name",
    TEAM_MEMBER_NAME_MAX,
    "INVALID_NAME",
  );
  const designation = optionalTrimmed(
    body.designation,
    "designation",
    TEAM_MEMBER_DESIGNATION_MAX,
    "INVALID_DESIGNATION",
  );
  const cellPhone = optionalTrimmed(
    body.cellPhone,
    "cellPhone",
    TEAM_MEMBER_CELL_MAX,
    "INVALID_CELL_PHONE",
  );
  let email = optionalTrimmed(
    body.email,
    "email",
    TEAM_MEMBER_EMAIL_MAX,
    "INVALID_EMAIL",
  );
  if (email && !EMAIL_RE.test(email)) {
    throw new OwnerActivationError(
      "email format is invalid",
      "INVALID_EMAIL",
      400,
    );
  }
  const bio = optionalTrimmed(
    body.bio,
    "bio",
    TEAM_MEMBER_BIO_MAX,
    "INVALID_BIO",
  );

  if (mode === "create") {
    return {
      name: name === undefined ? null : name,
      designation: designation === undefined ? null : designation,
      cellPhone: cellPhone === undefined ? null : cellPhone,
      email: email === undefined ? null : email,
      bio: bio === undefined ? null : bio,
    };
  }

  const out: NormalizedTeamMemberFields = {};
  if (name !== undefined) out.name = name;
  if (designation !== undefined) out.designation = designation;
  if (cellPhone !== undefined) out.cellPhone = cellPhone;
  if (email !== undefined) out.email = email;
  if (bio !== undefined) out.bio = bio;
  return out;
}

export function parseServiceAreasFromDb(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}
