import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const {
    getPropTxIdxConfig,
    getPropTxVowConfig,
  } = await import("../src/lib/proptx/config");
  const { proptxJson } = await import("../src/lib/proptx/client");

  const keys = ["E13600886", "W13598708", "X13591780", "W13589564"];
  for (const feed of [getPropTxIdxConfig(), getPropTxVowConfig()].filter(
    Boolean,
  )) {
    if (!feed) continue;
    console.log("\n=== feed", feed.feed, "===");
    for (const key of keys) {
      try {
        const row = (await proptxJson(`Property('${key}')`, feed)) as Record<
          string,
          unknown
        >;
        console.log(key, {
          StandardStatus: row.StandardStatus,
          MlsStatus: row.MlsStatus,
          PurchaseContractDate: row.PurchaseContractDate,
          CloseDate: row.CloseDate,
          StatusChangeTimestamp: row.StatusChangeTimestamp,
          SoldEntryTimestamp: row.SoldEntryTimestamp,
          ModificationTimestamp: row.ModificationTimestamp,
          ListingContractDate: row.ListingContractDate,
          ClosePrice: row.ClosePrice,
        });
      } catch (e) {
        console.log(
          key,
          "ERR",
          e instanceof Error ? e.message.slice(0, 160) : e,
        );
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
