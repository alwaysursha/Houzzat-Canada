import type { ActiveMode, Role } from "@prisma/client";
import { consumeEmailVerificationToken } from "@/lib/auth/email-verification";

export type VerifyEmailAuthUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  role: Role;
  isBuyer: boolean;
  isSeller: boolean;
  activeMode: ActiveMode;
};

/** Auth.js authorize() target after a one-time verification token is consumed. */
export async function authorizeEmailVerificationToken(
  token: string,
): Promise<VerifyEmailAuthUser | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;

  const result = await consumeEmailVerificationToken(trimmed);
  if (!result.ok) return null;

  return result.user;
}
