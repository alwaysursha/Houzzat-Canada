import Link from "next/link";
import { PlatformSmsQuickTextEditor } from "@/components/platform/PlatformSmsQuickTextEditor";
import { PlatformPageHeader, PlatformPanel } from "@/components/platform/PlatformUi";
import { SMS_QUICK_TEXT_PROTECTION_COPY } from "@/lib/sms/quick-texts/constants";

export default function PlatformSmsQuickTextNewPage() {
  return (
    <>
      <PlatformPageHeader
        title="New Quick Text"
        description="Available to Agents in every tenant workspace once active."
      >
        <Link
          href="/platform/sms-quick-texts"
          className="text-sm text-slate-400 hover:text-white"
        >
          ← All Quick Texts
        </Link>
      </PlatformPageHeader>
      <PlatformPanel title="Template">
        <PlatformSmsQuickTextEditor
          create
          protectionCopy={SMS_QUICK_TEXT_PROTECTION_COPY}
          item={null}
        />
      </PlatformPanel>
    </>
  );
}
