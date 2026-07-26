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
  homeAddress: true,
  homeLat: true,
  homeLng: true,
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
  homeAddress: string | null;
  homeLat: number | null;
  homeLng: number | null;
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
async function findCustomerUser(
  where: { id: string } | { email: string },
): Promise<CustomerUser | null> {
  try {
    return await prisma.user.findFirst({
      where,
      select: customerUserSelect,
    });
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
      homeAddress: null,
      homeLat: null,
      homeLng: null,
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

export async function requireCustomerUser(): Promise<CustomerUser | null> {
  const session = await auth();
  if (!session?.user?.id && !session?.user?.email) {
    return null;
  }

  // Prefer id, but fall back to email. After a DB switch (e.g. local → Neon)
  // the JWT can still carry a stale `sub` while the same email exists with a
  // new id — homepage lookups by email succeed, id-only API/account lookups 401.
  if (session.user.id) {
    const byId = await findCustomerUser({ id: session.user.id });
    if (byId) return byId;
  }

  if (session.user.email) {
    return findCustomerUser({
      email: session.user.email.trim().toLowerCase(),
    });
  }

  return null;
}
