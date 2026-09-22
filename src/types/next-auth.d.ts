import type { ActiveMode, Role } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      role: Role;
      isBuyer: boolean;
      isSeller: boolean;
      activeMode: ActiveMode;
      /** Tenant home workspace; null for platform sessions. */
      workspaceId?: string | null;
    };
  }

  interface User {
    role: Role;
    isBuyer?: boolean;
    isSeller?: boolean;
    activeMode?: ActiveMode;
    workspaceId?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: Role;
    isBuyer?: boolean;
    isSeller?: boolean;
    activeMode?: ActiveMode;
    subVerifiedAt?: number;
    /** Bound at sign-in; must match hostname workspace on tenant hosts. */
    workspaceId?: string | null;
    isPlatformSession?: boolean;
  }
}

export {};
