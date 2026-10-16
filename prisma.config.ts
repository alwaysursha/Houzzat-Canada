import { defineConfig } from "prisma/config";
import {
  loadPrismaEnv,
  resolvePrismaDatasourceUrl,
} from "./prisma/load-prisma-env";

// Explicit DATABASE_URL / DIRECT_URL (shell/CI/Vercel) take precedence over
// .env.local. See prisma/load-prisma-env.ts.
loadPrismaEnv();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node --import tsx prisma/seed.ts",
  },
  datasource: {
    url: resolvePrismaDatasourceUrl(),
  },
});
