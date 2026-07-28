import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const endpoint = process.env.PROPTX_ENDPOINT_URL!.replace(/\/+$/, "");
  const token = process.env.PROPTX_BEARER_TOKEN!;
  const tokenId = process.env.PROPTX_TOKEN_ID!;
  const headerName = process.env.PROPTX_TOKEN_ID_HEADER || "TokenId";

  async function get(path: string) {
    const res = await fetch(`${endpoint}/${path.replace(/^\//, "")}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        [headerName]: tokenId,
        Accept: "application/json",
      },
    });
    const text = await res.text();
    if (!res.ok) {
      console.error("FAIL", res.status, path, text.slice(0, 400));
      process.exit(1);
    }
    return JSON.parse(text) as { value?: Record<string, unknown>[] };
  }

  const data = await get("Property?$top=2");
  const rows = data.value ?? [];
  console.log("count", rows.length);
  for (const [i, row] of rows.entries()) {
    const keys = Object.keys(row).sort();
    console.log("\n--- row", i, "keyCount", keys.length, "---");
    const sample: Record<string, string> = {};
    for (const k of keys) {
      const v = row[k];
      if (v == null || v === "") continue;
      if (typeof v === "object") {
        sample[k] = Array.isArray(v)
          ? `array(${v.length})`
          : `object:${Object.keys(v as object).slice(0, 12).join(",")}`;
      } else {
        sample[k] = String(v).slice(0, 100);
      }
    }
    console.log(JSON.stringify(sample, null, 2));
  }

  const root = await fetch(`${endpoint}/`, {
    headers: {
      Authorization: `Bearer ${token}`,
      [headerName]: tokenId,
      Accept: "application/json",
    },
  });
  console.log("\n--- service root", root.status, "---");
  console.log((await root.text()).slice(0, 2000));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
