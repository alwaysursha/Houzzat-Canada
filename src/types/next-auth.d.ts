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
    };
  }

  interface User {
    role: Role;
    isBuyer?: boolean;
    isSeller?: boolean;
    activeMode?: ActiveMode;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: Role;
    isBuyer?: boolean;
    isSeller?: boolean;
    activeMode?: ActiveMode;
    subVerifiedAt?: number;
  }
}

export {};
