import { Suspense } from "react";
import { AgentChatsInbox } from "@/components/agent/chats/AgentChatsInbox";

export const metadata = { title: "Chats · CRM" };

export default function AgentChatsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full min-h-0 items-center justify-center text-sm text-[#64748b]">
          Loading chats…
        </div>
      }
    >
      <div className="h-full min-h-0 overflow-hidden">
        <AgentChatsInbox />
      </div>
    </Suspense>
  );
}
