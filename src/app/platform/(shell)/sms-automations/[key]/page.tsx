import Link from "next/link";
import { notFound } from "next/navigation";
import { PlatformSmsAutomationEditor } from "@/components/platform/PlatformSmsAutomationEditor";
import { PlatformDetailGrid } from "@/components/platform/PlatformDetailGrid";
import {
  PlatformBadge,
  PlatformErrorState,
  PlatformPageHeader,
  PlatformPanel,
} from "@/components/platform/PlatformUi";
import {
  getPlatformSmsAutomation,
  PlatformApiClientError,
} from "@/lib/platform/ui/api-client";
import { SMS_AUTOMATION_PROTECTION_COPY } from "@/lib/platform/sms-automations/constants";
import { formatPlatformDate, titleCaseStatus } from "@/lib/platform/ui/format";
import { platformStatusTone } from "@/lib/platform/ui/status-tone";

type PageProps = {
  params: Promise<{ key: string }>;
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function str(value: unknown): string {
  if (value == null || value === "") return "—";
  return String(value);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function asNumberArray(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const nums = value
    .map((item) => (typeof item === "number" ? item : Number(item)))
    .filter((item) => Number.isInteger(item));
  return nums.length ? nums : null;
}

export default async function PlatformSmsAutomationDetailPage({
  params,
}: PageProps) {
  const { key } = await params;
  const decoded = decodeURIComponent(key);
  let payload: JsonRecord | null = null;
  let errorMessage: string | null = null;

  try {
    payload = (await getPlatformSmsAutomation(decoded)) as JsonRecord;
  } catch (error) {
    if (error instanceof PlatformApiClientError && error.status === 404) {
      notFound();
    }
    errorMessage =
      error instanceof PlatformApiClientError
        ? error.message
        : "Unable to load SMS automation.";
  }

  if (errorMessage) {
    return (
      <>
        <PlatformPageHeader title="SMS automation" />
        <PlatformErrorState
          title="Automation unavailable"
          message={errorMessage}
        />
      </>
    );
  }

  const automation = asRecord(payload?.automation);
  if (!automation) notFound();

  const published = asRecord(automation.publishedVersion);
  const draft = asRecord(automation.draftVersion);
  const buckets = asNumberArray(automation.inactivityBuckets);
  const editorKey = `${str(automation.key)}:${str(published?.id)}:${str(draft?.id)}`;

  return (
    <>
      <PlatformPageHeader
        title={str(automation.name)}
        description={str(automation.description)}
      >
        <Link
          href="/platform/sms-automations"
          className="text-sm text-slate-400 hover:text-white"
        >
          ← All automations
        </Link>
      </PlatformPageHeader>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <PlatformBadge tone={platformStatusTone(automation.active ? "ACTIVE" : "INACTIVE")}>
          {automation.active ? "Active" : "Inactive"}
        </PlatformBadge>
        <PlatformBadge tone="info">
          {titleCaseStatus(str(automation.recipient))}
        </PlatformBadge>
        <PlatformBadge tone={automation.replyEnabled ? "success" : "neutral"}>
          {automation.replyEnabled ? "Reply-enabled" : "Notify only"}
        </PlatformBadge>
        <PlatformBadge tone={published ? "success" : "warning"}>
          {published ? `Published v${str(published.versionNumber)}` : "No published version"}
        </PlatformBadge>
      </div>

      <div className="mb-6">
        <PlatformPanel title="Definition">
          <PlatformDetailGrid
            items={[
              { label: "Key", value: str(automation.key) },
              { label: "Trigger", value: titleCaseStatus(str(automation.triggerKey)) },
              { label: "Created", value: formatPlatformDate(str(automation.createdAt)) },
              { label: "Updated", value: formatPlatformDate(str(automation.updatedAt)) },
              {
                label: "Delay",
                value:
                  typeof automation.delayMinutes === "number"
                    ? `${automation.delayMinutes} min`
                    : "None",
              },
              {
                label: "Inactivity",
                value: automation.inactivityDays
                  ? `${String(automation.inactivityDays)} days`
                  : "—",
              },
              {
                label: "Return buckets",
                value: buckets ? buckets.map((day) => `${day}d`).join(", ") : "—",
              },
            ]}
          />
        </PlatformPanel>
      </div>

      <PlatformPanel title="Draft → Preview → Publish">
        <PlatformSmsAutomationEditor
          key={editorKey}
          protectionCopy={
            typeof payload?.protectionCopy === "string"
              ? payload.protectionCopy
              : SMS_AUTOMATION_PROTECTION_COPY
          }
          automation={{
            key: str(automation.key),
            name: String(automation.name ?? ""),
            recipient: str(automation.recipient),
            triggerKey: str(automation.triggerKey),
            description:
              typeof automation.description === "string"
                ? automation.description
                : null,
            active: Boolean(automation.active),
            replyEnabled: Boolean(automation.replyEnabled),
            delayEditable: Boolean(automation.delayEditable),
            delayMinutes:
              typeof automation.delayMinutes === "number"
                ? automation.delayMinutes
                : null,
            inactivityDays:
              typeof automation.inactivityDays === "number"
                ? automation.inactivityDays
                : null,
            inactivityBuckets: buckets,
            allowedVariables: asStringArray(automation.allowedVariables),
            createdAt: str(automation.createdAt),
            updatedAt: str(automation.updatedAt),
            publishedVersion: published as never,
            draftVersion: draft as never,
            versions: Array.isArray(automation.versions)
              ? (automation.versions as never)
              : [],
          }}
        />
      </PlatformPanel>
    </>
  );
}
