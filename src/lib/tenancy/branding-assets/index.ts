export {
  BRANDING_ASSET_KINDS,
  isBrandingAssetKind,
  brandingAssetColumn,
  brandingAssetFolder,
  type BrandingAssetKind,
} from "./kinds";
export {
  buildBrandingObjectKey,
  extractBrandingObjectKeyFromUrl,
  buildAgentUserProfileObjectKey,
  extractAgentUserProfileObjectKeyFromUrl,
  extractManagedProfileObjectKeyFromUrl,
  parseAgentUserProfileObjectKey,
  type ParsedAgentUserProfileObjectKey,
  type AgentUserProfileObjectKeyExt,
} from "./keys";
export {
  uploadAgentUserProfilePhoto,
  removeAgentUserProfilePhoto,
  canMutateAgentUserProfilePhoto,
  type AgentUserProfilePhotoResult,
} from "./agent-user-profile-photo";
export {
  clearAgentEmailHeadshotAssociation,
  persistAgentEmailHeadshotAssociationIfCurrent,
} from "./agent-email-headshot-association";
export {
  tryResolveVerifiedEmailHeadshotUrl,
  resolveVerifiedAgentEmailSignaturePhoto,
  type AgentEmailHeadshotAssociationView,
  type ResolvedAgentEmailSignaturePhoto,
} from "./email-headshot-resolve";
export {
  isManagedAgentProfileUrlReferenced,
  deleteManagedAgentProfileUrlIfUnreferenced,
  type ManagedProfileCdnDeleteResult,
} from "./managed-profile-cdn";
export {
  AGENT_EMAIL_HEADSHOT_SUFFIX,
  AGENT_EMAIL_HEADSHOT_EXT,
  AGENT_EMAIL_HEADSHOT_FILENAME_SUFFIX,
  buildAgentEmailHeadshotObjectKey,
  buildAgentEmailHeadshotPublicUrl,
  buildTrustedBrandingAssetPublicUrl,
  resolveTrustedBrandingAssetsPublicBase,
  deriveAgentEmailHeadshotObjectKey,
  deriveAgentEmailHeadshotObjectKeyFromUrl,
  extractAgentEmailHeadshotObjectKeyFromUrl,
  isAgentEmailHeadshotObjectKey,
  parseAgentEmailHeadshotObjectKey,
  deleteAgentEmailHeadshotSiblingIfUnreferenced,
  setEmailHeadshotStorageTestDeps,
  type ParsedAgentEmailHeadshotObjectKey,
  type AgentEmailHeadshotDeleteResult,
  type EmailHeadshotStorageTestDeps,
} from "./email-headshot-storage";
export {
  validateBrandingImageBytes,
  validateEmailHeadshotBytes,
  BRANDING_ASSET_MAX_BYTES,
  EMAIL_HEADSHOT_MAX_BYTES,
  EMAIL_HEADSHOT_MAX_DECODED_BYTES,
  EMAIL_HEADSHOT_REQUIRED_SIZE,
  type ValidatedEmailHeadshot,
  type EmailHeadshotValidationError,
} from "./validate";
export {
  validateEmailHeadshotPngStructure,
  pngCrc32,
  PNG_SIGNATURE,
  type EmailHeadshotPngResult,
} from "./email-headshot-png";
export {
  brandingRequirementsForCategory,
  evaluateBrandingStatus,
  type BrandingAssetSnapshot,
  type BrandingRequirement,
} from "./requirements";
export {
  putBrandingAssetObject,
  deleteBrandingAssetObject,
  deleteBrandingAssetByPersistedUrl,
  setBrandingStorageTestDeps,
  BrandingStorageNotConfiguredError,
  BRANDING_STORAGE_NOT_CONFIGURED,
  type BrandingAssetPutResult,
} from "./storage";
export {
  uploadWorkspaceBrandingAsset,
  removeWorkspaceBrandingAsset,
  refreshWorkspaceBrandingStatus,
  type BrandingAssetsView,
} from "./manage";
