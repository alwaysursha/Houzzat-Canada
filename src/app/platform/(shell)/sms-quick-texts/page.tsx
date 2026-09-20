import Link from "next/link";
import {
  PlatformBadge,
  PlatformEmptyState,
  PlatformErrorState,
  PlatformPageHeader,
  PlatformTableWrap,
} from "@/components/platform/PlatformUi";
import {
  listPlatformSmsQuickTexts,
  PlatformApiClientError,
} from "@/lib/platform/ui/api-client";
import { formatPlatformDate } from "@/lib/platform/ui/format";
import { platformStatusTone } from "@/lib/platform/ui/status-tone";

type JsonRecord = Record<string, unknown>;

function str(value: unknown): string {
  if (value == null || value === "") return "—";
  return String(value);
}

export default async function PlatformSmsQuickTextsPage() {
  let payload: { protectionCopy?: string; items?: JsonRecord[] } | null = null;
  let errorMessage: string | null = null;

  try {
    payload = (await listPlatformSmsQuickTexts()) as {
      protectionCopy?: string;
      items?: JsonRecord[];
    };
  } catch (error) {
    errorMessage =
      error instanceof PlatformApiClientError
        ? error.message
        : "Unable to load Quick Texts.";
  }

  const items = payload?.items ?? [];

  return (
    <>
      <PlatformPageHeader
        title="Quick Texts"
        description="Global SMS suggestions for Agents. Selecting one fills the composer — it does not send. Tenants cannot edit these templates."
      >
        <Link
          href="/platform/sms-quick-texts/new"
          className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
        >
          New Quick Text
        </Link>
      </PlatformPageHeader>

      {payload?.protectionCopy ? (
        <p className="mb-6 max-w-3xl text-sm text-slate-500">
          {payload.protectionCopy}
        </p>
      ) : null}

      {errorMessage ? (
        <PlatformErrorState
          title="Quick Texts unavailable"
          message={errorMessage}
        />
      ) : items.length === 0 ? (
        <PlatformEmptyState message="No Quick Texts seeded yet." />
      ) : (
        <PlatformTableWrap>
          <thead className="bg-slate-900/60 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-[#111827]">
            {items.map((row) => (
              <tr key={str(row.id)} className="hover:bg-slate-800/40">
                <td className="px-4 py-3">
                  <Link
                    href={`/platform/sms-quick-texts/${encodeURIComponent(str(row.id))}`}
                    className="font-medium text-emerald-400 hover:text-emerald-300"
                  >
                    {str(row.name)}
                  </Link>
                  <p className="text-xs text-slate-500">{str(row.key)}</p>
                </td>
                <td className="px-4 py-3 text-slate-300">{str(row.category)}</td>
                <td className="px-4 py-3">
                  <PlatformBadge
                    tone={platformStatusTone(row.active ? "ACTIVE" : "INACTIVE")}
                  >
                    {row.active ? "Active" : "Inactive"}
                  </PlatformBadge>
                </td>
                <td className="px-4 py-3 text-slate-400">
                  {formatPlatformDate(str(row.updatedAt))}
                </td>
              </tr>
            ))}
          </tbody>
        </PlatformTableWrap>
      )}
    </>
  );
}
