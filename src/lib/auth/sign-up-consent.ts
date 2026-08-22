import type { PrismaClient } from "@prisma/client";
import {
  COMMUNICATIONS_CONSENT_KIND,
  COMMUNICATIONS_CONSENT_VERSION,
  TERMS_ACCEPT_KIND,
  TERMS_VERSION,
} from "@/lib/consent";
import { VOW_VERSION } from "@/lib/vow";

/** Consent audit rows recorded on every Houzzat client signup. */
export const SIGNUP_CONSENT_SPECS = [
  { kind: TERMS_ACCEPT_KIND, version: TERMS_VERSION },
  { kind: "vow_accept", version: VOW_VERSION },
  {
    kind: COMMUNICATIONS_CONSENT_KIND,
    version: COMMUNICATIONS_CONSENT_VERSION,
  },
] as const;

export type SignupConsentInput = {
  userId: string;
  email: string;
  ip?: string;
  userAgent?: string;
};

/**
 * Flat sequential writes — PrismaNeonHttp on Workers rejects nested
 * relation creates and batch createMany for this path.
 */
export async function persistSignupConsentEvents(
  db: Pick<PrismaClient, "consentEvent">,
  input: SignupConsentInput,
): Promise<void> {
  for (const spec of SIGNUP_CONSENT_SPECS) {
    await db.consentEvent.create({
      data: {
        userId: input.userId,
        kind: spec.kind,
        version: spec.version,
        email: input.email,
        ip: input.ip,
        userAgent: input.userAgent,
      },
    });
  }
}
