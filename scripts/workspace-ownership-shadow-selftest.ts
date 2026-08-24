/**
 * Stage 3C — shadow ownership validation (read-only).
 * Run: pnpm workspace-ownership:shadow
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

import { runShadowOwnershipValidation } from "./lib/houzzat-workspace-ownership";

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  try {
    const results = await runShadowOwnershipValidation(prisma);
    console.log(JSON.stringify({ results }, null, 2));

    const failed = results.filter((row) => !row.ok);
    if (failed.length > 0) {
      console.error("SHADOW VALIDATION FAILED");
      process.exit(1);
    }

    console.log("workspace-ownership:shadow: ok");
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "workspace ownership shadow failed",
  );
  process.exit(1);
});
