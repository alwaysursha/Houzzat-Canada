/**
 * Keep repairing approximate ACTIVE pins until the backlog drains.
 * Usage: pnpm exec tsx scripts/mls-geocode-loop.ts [batch=800] [maxBatches=200]
 */
import { config } from "dotenv";
import { spawn } from "node:child_process";

config({ path: ".env.local" });
config({ path: ".env" });

const batch = Math.max(50, Number(process.argv[2] ?? 1200));
const maxBatches = Math.max(1, Number(process.argv[3] ?? 100));

function runGeocode(limit: number): Promise<{
  ok: number;
  fail: number;
  remainingActive: number;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "pnpm",
      ["mls:geocode", String(limit)],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          // Default OFF for paid Google — bulk loops burned ~$50/day when
          // Photon misses fell through to Geocoding + Places Text Search.
          // Opt in only with GEOCODE_USE_GOOGLE=1.
          GEOCODE_SKIP_GOOGLE:
            process.env.GEOCODE_USE_GOOGLE === "1" ? "0" : "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      out += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      process.stderr.write(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`mls:geocode exited ${code}`));
        return;
      }
      // Prefer the batch summary object (dotenv tips also print `{ … }` blobs).
      const matches = [
        ...out.matchAll(
          /\{\s*"ok"\s*:\s*\d+[\s\S]*?"remainingActive"\s*:\s*\d+[\s\S]*?\}/g,
        ),
      ];
      const raw = matches[matches.length - 1]?.[0];
      if (!raw) {
        reject(new Error("Could not parse geocode summary JSON"));
        return;
      }
      const summary = JSON.parse(raw) as {
        ok: number;
        fail: number;
        remainingActive: number;
      };
      resolve(summary);
    });
  });
}

async function main() {
  let prevRemaining = Number.POSITIVE_INFINITY;
  let stall = 0;

  for (let i = 1; i <= maxBatches; i += 1) {
    console.log(`\n=== geocode loop batch ${i}/${maxBatches} (limit=${batch}) ===`);
    const summary = await runGeocode(batch);
    console.log("batch summary", summary);

    if (summary.remainingActive <= 0) {
      console.log("ACTIVE approximate backlog cleared.");
      break;
    }
    if (summary.ok === 0) {
      stall += 1;
      console.log(`no successes (${stall}/3 stall)`);
      if (stall >= 3) {
        console.log("Stopping — street geocoder not making progress.");
        break;
      }
    } else {
      stall = 0;
    }
    if (summary.remainingActive >= prevRemaining) {
      // New listings may arrive while we work; only stop if zero ok.
    }
    prevRemaining = summary.remainingActive;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
