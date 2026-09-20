import Link from "next/link";
import { notFound } from "next/navigation";
import { PlatformSmsQuickTextEditor } from "@/components/platform/PlatformSmsQuickTextEditor";
import {
  PlatformErrorState,
  PlatformPageHeader,
  PlatformPanel,
} from "@/components/platform/PlatformUi";
import { SMS_QUICK_TEXT_PROTECTION_COPY } from "@/lib/sms/quick-texts/constants";
import {
  getPlatformSmsQuickText,
  PlatformApiClientError,
} from "@/lib/platform/ui/api-client";

type PageProps = {
  params: Promise<{ id: string }>;
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

export default async function PlatformSmsQuickTextDetailPage({
  params,
}: PageProps) {
  const { id } = await params;
  const decoded = decodeURIComponent(id);
  let payload: JsonRecord | null = null;
  let errorMessage: string | null = null;

  try {
    payload = (await getPlatformSmsQuickText(decoded)) as JsonRecord;
  } catch (error) {
    if (error instanceof PlatformApiClientError && error.status === 404) {
      notFound();
    }
    errorMessage =
      error instanceof PlatformApiClientError
        ? error.message
        : "Unable to load Quick Text.";
  }

  if (errorMessage) {
    return (
      <>
        <PlatformPageHeader title="Quick Text" />
        <PlatformErrorState title="Quick Text unavailable" message={errorMessage} />
      </>
    );
  }

  const item = asRecord(payload?.item);
  if (!item) notFound();

  return (
    <>
      <PlatformPageHeader title={str(item.name)} description={str(item.category)}>
        <Link
          href="/platform/sms-quick-texts"
          className="text-sm text-slate-400 hover:text-white"
        >
          ← All Quick Texts
        </Link>
      </PlatformPageHeader>
      <PlatformPanel title="Template">
        <PlatformSmsQuickTextEditor
          protectionCopy={
            typeof payload?.protectionCopy === "string"
              ? payload.protectionCopy
              : SMS_QUICK_TEXT_PROTECTION_COPY
          }
          item={{
            id: str(item.id),
            key: str(item.key),
            name: String(item.name ?? ""),
            category: String(item.category ?? ""),
            body: String(item.body ?? ""),
            active: Boolean(item.active),
            allowedVariables: asStringArray(item.allowedVariables),
          }}
        />
      </PlatformPanel>
    </>
  );
}
