import Credentials from "next-auth/providers/credentials";
import {
  consumeMobileWorkspaceHandoff,
  MOBILE_HANDOFF_PROVIDER_ID,
} from "@/lib/mobile/mobile-workspace-handoff";

/** Auth.js provider — exchange consumed only via server-side /api/mobile/workspace-handoff/exchange. */
export const mobileWorkspaceHandoffProvider = Credentials({
  id: MOBILE_HANDOFF_PROVIDER_ID,
  name: "Mobile workspace handoff",
  credentials: {
    code: { label: "Code", type: "text" },
    hostname: { label: "Hostname", type: "text" },
  },
  async authorize(credentials) {
    const code = credentials?.code?.toString() ?? "";
    const hostname = credentials?.hostname?.toString() ?? "";
    if (!code || !hostname) return null;

    const result = await consumeMobileWorkspaceHandoff({
      rawCode: code,
      requestHostname: hostname,
    });
    if (!result.ok) return null;

    return {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      image: result.user.image,
      role: result.user.role,
      isBuyer: result.user.isBuyer,
      isSeller: result.user.isSeller,
      activeMode: result.user.activeMode,
    };
  },
});
