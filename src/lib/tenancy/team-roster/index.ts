/**
 * Stage 6.11E.4 — Team Profile + public roster OWNER API foundation.
 */

export {
  TEAM_ABOUT_TEXT_MAX,
  TEAM_MEMBER_BIO_MAX,
  TEAM_MEMBER_CELL_MAX,
  TEAM_MEMBER_DESIGNATION_MAX,
  TEAM_MEMBER_EMAIL_MAX,
  TEAM_MEMBER_NAME_MAX,
  TEAM_MEMBER_SORT_STEP,
  TEAM_SERVICE_AREA_MAX_COUNT,
  TEAM_SERVICE_AREA_MAX_LENGTH,
} from "@/lib/tenancy/team-roster/limits";
export {
  extractTeamMemberPhotoObjectKeyFromUrl,
  isAcceptedTeamMemberPhotoUrl,
} from "@/lib/tenancy/team-roster/photo";
export {
  assertTeamMemberPublishable,
  normalizeAboutText,
  normalizeServiceAreas,
  normalizeTeamMemberWriteFields,
  parseServiceAreasFromDb,
  validateTeamMemberForPublication,
  type TeamMemberPublicationInput,
  type TeamMemberPublicationResult,
} from "@/lib/tenancy/team-roster/validate";
export {
  clearOwnerTeamLeader,
  createOwnerTeamMember,
  getOwnerTeamMember,
  getOwnerTeamProfile,
  hideOwnerTeamMember,
  listOwnerTeamMembers,
  removeOwnerTeamMember,
  reorderOwnerTeamMembers,
  setOwnerTeamLeader,
  showOwnerTeamMember,
  updateOwnerTeamMember,
  updateOwnerTeamProfile,
  type PublicTeamMemberDto,
  type PublicTeamProfileDto,
} from "@/lib/tenancy/team-roster/manage";
