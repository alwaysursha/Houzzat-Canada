import Link from "next/link";
import {
  PlatformBadge,
  PlatformEmptyState,
  PlatformErrorState,
  PlatformPageHeader,
  PlatformTableWrap,
} from "@/components/platform/PlatformUi";
import {
  listPlatformSmsAutomations,
  PlatformApiClientError,
} from "@/lib/platform/ui/api-client";
import { formatPlatformDate, titleCaseStatus } from "@/lib/platform/ui/format";
import { platformStatusTone } from "@/lib/platform/ui/status-tone";

type JsonRecord = Record<string, unknown>;

function str(value: unknown): string {
  if (value == null || value === "") return "—";
  return String(value);
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

export default async function PlatformSmsAutomationsPage() {
  let payload: { protectionCopy?: string; items?: JsonRecord[] } | null = null;
  let errorMessage: string | null = null;

  try {
    payload = (await listPlatformSmsAutomations()) as {
      protectionCopy?: string;
      items?: JsonRecord[];
    };
  } catch (error) {
    errorMessage =
      error instanceof PlatformApiClientError
        ? error.message
        : "Unable to load SMS automations.";
  }

  const items = payload?.items ?? [];

  return (
    <>
      <PlatformPageHeader
        title="SMS Automations"
        description="Central templates for every tenant workspace. Tenants cannot edit these rules. Production always uses the latest published version."
      />

      {payload?.protectionCopy ? (
        <p className="mb-6 max-w-3xl text-sm text-slate-500">
          {payload.protectionCopy}
        </p>
      ) : null}

      {errorMessage ? (
        <PlatformErrorState
          title="SMS automations unavailable"
          message={errorMessage}
        />
      ) : items.length === 0 ? (
        <PlatformEmptyState message="No SMS automations seeded yet." />
      ) : (
        <PlatformTableWrap>
          <thead className="bg-slate-900/60 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Automation</th>
              <th className="px-4 py-3">Recipient</th>
              <th className="px-4 py-3">Trigger</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Published</th>
              <th className="px-4 py-3">Reply</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-[#111827]">
            {items.map((row) => {
              const published = asRecord(row.publishedVersion);
              return (
                <tr key={str(row.key)} className="hover:bg-slate-800/40">
                  <td className="px-4 py-3">
                    <Link
                      href={`/platform/sms-automations/${encodeURIComponent(str(row.key))}`}
                      className="font-medium text-emerald-400 hover:text-emerald-300"
                    >
                      {str(row.name)}
                    </Link>
                    <p className="text-xs text-slate-500">{str(row.key)}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {titleCaseStatus(str(row.recipient))}
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {titleCaseStatus(str(row.triggerKey))}
                  </td>
                  <td className="px-4 py-3">
                    <PlatformBadge
                      tone={platformStatusTone(row.active ? "ACTIVE" : "INACTIVE")}
                    >
                      {row.active ? "Active" : "Inactive"}
                    </PlatformBadge>
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {published
                      ? `v${str(published.versionNumber)} · ${formatPlatformDate(str(published.publishedAt))}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {row.replyEnabled ? "Yes" : "No"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </PlatformTableWrap>
      )}
    </>
  );
}
