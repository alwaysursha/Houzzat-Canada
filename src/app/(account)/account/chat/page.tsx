import { Suspense } from "react";
import { CustomerChatScreen } from "@/components/customer-chat/CustomerChatScreen";

export const metadata = { title: "Chat" };

export default function AccountChatPage() {
  return (
    <Suspense fallback={null}>
      <CustomerChatScreen />
    </Suspense>
  );
}
