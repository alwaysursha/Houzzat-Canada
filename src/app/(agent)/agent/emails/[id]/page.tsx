import Link from "next/link";
import { notFound, redirect } from "next/navigation";
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
  if (!ctx) redirect("/auth/sign-in?callbackUrl=/agent");

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
