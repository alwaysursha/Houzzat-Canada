import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { staffSignInRedirectUrl } from "@/lib/auth/staff-sign-in-redirect";
import { ArrowLeft } from "lucide-react";
import { canAccessLead, requireAgentContext } from "@/lib/agent";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Email preview · Agent CRM" };

export default async function AgentEmailPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireAgentContext();
  if (!ctx) redirect(await staffSignInRedirectUrl("/agent"));

  const { id } = await params;
  const email = await prisma.leadEmailLog.findUnique({
    where: { id },
    include: {
      lead: {
        select: {
          id: true,
          organizationId: true,
          assignedAgentId: true,
          customer: { select: { name: true, email: true } },
        },
      },
      sentBy: { select: { name: true, email: true } },
    },
  });

  if (!email || !canAccessLead(ctx, email.lead)) notFound();

  const html = email.htmlBody?.trim() || null;
  const profileHref = `/agent/leads?lead=${email.leadId}`;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={profileHref}
            className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#2b6cb0] hover:underline"
          >
            <ArrowLeft className="size-3.5" />
            Back to lead profile
          </Link>
          <h1 className="mt-2 text-xl font-bold text-[#1e2a38]">
            {email.subject}
          </h1>
          <p className="mt-1 text-[13px] text-[#64748b]">
            To {email.toEmail}
            {email.lead.customer?.name ? ` · ${email.lead.customer.name}` : ""}
            {" · "}
            {email.createdAt.toLocaleString("en-CA")}
            {email.kind ? ` · ${email.kind.replaceAll("_", " ")}` : ""}
            {email.sentBy
              ? ` · by ${email.sentBy.name || email.sentBy.email}`
              : " · automated"}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {email.openedAt ? (
              <span className="rounded-md bg-[#d1fae5] px-2 py-0.5 text-[11px] font-bold text-[#047857] ring-1 ring-[#6ee7b7]">
                Opened
                {email.openCount > 1 ? ` · ${email.openCount}×` : ""}
                {" · "}
                {email.openedAt.toLocaleString("en-CA")}
              </span>
            ) : (
              <span className="rounded-md bg-[#f1f5f9] px-2 py-0.5 text-[11px] font-semibold text-[#94a3b8]">
                Not opened yet
              </span>
            )}
            {email.clickedAt ? (
              <span className="rounded-md bg-[#fef3c7] px-2 py-0.5 text-[11px] font-bold text-[#b45309] ring-1 ring-[#fcd34d]">
                Clicked
                {email.clickCount > 1 ? ` · ${email.clickCount}×` : ""}
                {email.lastClickedUrl
                  ? ` · ${email.lastClickedUrl.slice(0, 60)}`
                  : ""}
              </span>
            ) : null}
          </div>
        </div>
        <Link
          href={`/agent/leads?view=mine&lead=${email.leadId}`}
          className="rounded-lg bg-[#2b6cb0] px-3 py-2 text-[13px] font-semibold text-white hover:bg-[#245a96]"
        >
          Open lead
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white shadow-sm">
        {html ? (
          <iframe
            title="Email preview"
            srcDoc={html}
            className="h-[min(80vh,900px)] w-full border-0 bg-[#f1f5f9]"
          />
        ) : (
          <pre className="whitespace-pre-wrap p-6 text-sm text-[#334155]">
            {email.body}
          </pre>
        )}
      </div>
    </div>
  );
}
