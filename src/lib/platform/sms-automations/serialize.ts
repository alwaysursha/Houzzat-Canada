import { parseInactivityBuckets } from "./buckets";
import { smsAutomationCatalogByKey } from "./catalog";
import type {
  SmsAutomationDefinitionRow,
  SmsAutomationVersionRow,
} from "./manage";
import { currentDraftVersion, latestPublishedVersion } from "./manage";

export function serializeSmsAutomationVersion(row: SmsAutomationVersionRow) {
  return {
    id: row.id,
    versionNumber: row.versionNumber,
    status: row.status,
    body: row.body,
    delayMinutes: row.delayMinutes,
    inactivityDays: row.inactivityDays,
    inactivityBuckets: parseInactivityBuckets(row.inactivityBucketsJson),
    createdAt: row.createdAt.toISOString(),
    createdByOperatorId: row.createdByOperatorId,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    publishedByOperatorId: row.publishedByOperatorId,
    rollbackOfVersionId: row.rollbackOfVersionId,
  };
}

export function serializeSmsAutomation(
  definition: SmsAutomationDefinitionRow,
  versions: SmsAutomationVersionRow[],
) {
  const spec = smsAutomationCatalogByKey(definition.key);
  const published = latestPublishedVersion(versions);
  const draft = currentDraftVersion(versions);
  return {
    id: definition.id,
    key: definition.key,
    name: definition.name,
    recipient: definition.recipient,
    triggerKey: definition.triggerKey,
    description: definition.description,
    active: definition.active,
    replyEnabled: definition.replyEnabled,
    delayEditable: spec?.delayEditable ?? false,
    delayMinutes:
      draft?.delayMinutes ??
      published?.delayMinutes ??
      definition.delayMinutes,
    inactivityDays: definition.inactivityDays,
    inactivityBuckets: parseInactivityBuckets(definition.inactivityBucketsJson),
    allowedVariables: definition.allowedVariables,
    createdAt: definition.createdAt.toISOString(),
    updatedAt: definition.updatedAt.toISOString(),
    publishedVersion: published
      ? serializeSmsAutomationVersion(published)
      : null,
    draftVersion: draft ? serializeSmsAutomationVersion(draft) : null,
    versions: [...versions]
      .sort((a, b) => b.versionNumber - a.versionNumber)
      .map(serializeSmsAutomationVersion),
  };
}
