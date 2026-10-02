/**
 * Confirms Google Routes stays inside the free cap and the billable
 * catalogue geocode / Places switches stay closed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Prisma } from "@prisma/client";
import { config } from "dotenv";
import { prisma } from "../src/lib/prisma";
import { GOOGLE_ROUTES_MONTHLY_CAP } from "../src/lib/google/routes";

config({ path: ".env.local" });
config({ path: ".env" });

function env(name: string) {
  return process.env[name]?.trim() ?? "";
}

async function main() {
  assert.equal(env("GOOGLE_MAPS_BILLING_ENABLED"), "0");
  assert.equal(env("GEOCODE_SKIP_GOOGLE"), "1");
  assert.notEqual(env("GEOCODE_USE_GOOGLE"), "1");
  assert.equal(env("GOOGLE_PLACES_AUTOCOMPLETE"), "0");
  assert.equal(env("GOOGLE_ROUTES_ENABLED"), "1");
  assert.equal(GOOGLE_ROUTES_MONTHLY_CAP < 10000, true);

  const routes = readFileSync("src/lib/google/routes.ts", "utf8");
  const geocode = readFileSync("src/lib/geo/geocode.ts", "utf8");
  const drive = readFileSync("src/app/api/routes/drive/route.ts", "utf8");
  const workflow = readFileSync(".github/workflows/mls-geocode.yml", "utf8");
  assert.equal(routes.includes("TRAFFIC_AWARE"), false);
  assert.equal(routes.includes("GOOGLE_ROUTES_MONTHLY_CAP"), true);
  assert.equal(geocode.includes("isGoogleGeocodingEnabled()"), true);
  assert.equal(drive.includes("requireCustomerUser()"), true);
  assert.equal(workflow.includes("if: ${{ false }}"), true);
  assert.equal(/^\s*schedule:/m.test(workflow), false);

  const month = "1999-01";
  await prisma.googleRouteUsage.upsert({
    where: { month },
    create: { month, count: GOOGLE_ROUTES_MONTHLY_CAP },
    update: { count: GOOGLE_ROUTES_MONTHLY_CAP },
  });
  const blocked = await prisma.$queryRaw<Array<{ count: number }>>(
    Prisma.sql`
      UPDATE "GoogleRouteUsage"
      SET "count" = "count" + 1
      WHERE "month" = ${month} AND "count" < ${GOOGLE_ROUTES_MONTHLY_CAP}
      RETURNING "count"
    `,
  );
  assert.equal(blocked.length, 0);
  await prisma.googleRouteUsage.delete({ where: { month } });

  console.log(
    JSON.stringify({
      ok: true,
      cap: GOOGLE_ROUTES_MONTHLY_CAP,
      routesEnabled: true,
      geocodeAndPlaces: "off",
    }),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
