import type { Prisma, Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Fields account + API routes actually need from User. */
export const customerUserSelect = {
  id: true,
  email: true,
  name: true,
  image: true,
  phone: true,
  role: true,
  caslConsentAt: true,
  vowAcceptedAt: true,
  vowVersion: true,
  emailAlertsEnabled: true,
  smsAlertsEnabled: true,
  relatedListingsMode: true,
  termsAcceptedAt: true,
  termsVersion: true,
} satisfies Prisma.UserSelect;

export type CustomerUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  phone: string | null;
  role: Role;
  caslConsentAt: Date | null;
  vowAcceptedAt: Date | null;
  vowVersion: string | null;
  emailAlertsEnabled: boolean;
  smsAlertsEnabled: boolean;
  relatedListingsMode: "SAME_AREA" | "SAME_FEATURES";
  termsAcceptedAt: Date | null;
  termsVersion: string | null;
};

/** Columns that existed on the earliest Houzzat User table. */
const customerUserSelectLegacy = {
  id: true,
  email: true,
  name: true,
  image: true,
  role: true,
} satisfies Prisma.UserSelect;

/**
 * Load the signed-in customer with a narrow select.
 * Falls back to legacy columns if Neon is behind the Prisma schema
 * so /account stays up until `db:push` catches up.
 */
export async function requireCustomerUser(): Promise<CustomerUser | null> {
  const session = await auth();
  if (!session?.user?.id && !session?.user?.email) {
    return null;
  }

  const where = session.user.id
    ? { id: session.user.id }
    : { email: session.user.email! };

  try {
    const user = await prisma.user.findFirst({
      where,
      select: customerUserSelect,
    });
    return user;
  } catch (error) {
    console.error(
      "[account] full customer select failed; retrying legacy fields",
      error,
    );
    const user = await prisma.user.findFirst({
      where,
      select: customerUserSelectLegacy,
    });
    if (!user) return null;
    return {
      ...user,
      phone: null,
      caslConsentAt: null,
      vowAcceptedAt: null,
      vowVersion: null,
      emailAlertsEnabled: true,
      smsAlertsEnabled: false,
      relatedListingsMode: "SAME_AREA",
      termsAcceptedAt: null,
      termsVersion: null,
    };
  }
}
