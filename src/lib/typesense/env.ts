import { getCloudflareContext } from "@opennextjs/cloudflare";

type TypesenseBindings = {
  TYPESENSE_HOST?: string;
  TYPESENSE_PORT?: string;
  TYPESENSE_PROTOCOL?: string;
  TYPESENSE_ADMIN_API_KEY?: string;
  TYPESENSE_SEARCH_API_KEY?: string;
  TYPESENSE_COLLECTION?: string;
  TYPESENSE_AUTOCOMPLETE?: string;
  TYPESENSE_SEARCH?: string;
  TYPESENSE_SYNC?: string;
};

function readBindings(): TypesenseBindings {
  try {
    const { env } = getCloudflareContext();
    return env as typeof env & TypesenseBindings;
  } catch {
    return {};
  }
}

/** Prefer Worker bindings, then process.env (local / scripts). */
export function typesenseEnv(name: keyof TypesenseBindings): string | undefined {
  const fromBinding = readBindings()[name];
  if (typeof fromBinding === "string" && fromBinding.trim()) {
    return fromBinding.trim();
  }
  const fromProcess = process.env[name];
  if (typeof fromProcess === "string" && fromProcess.trim()) {
    return fromProcess.trim();
  }
  return undefined;
}

export function typesenseFlagEnabled(
  name: "TYPESENSE_AUTOCOMPLETE" | "TYPESENSE_SEARCH" | "TYPESENSE_SYNC",
): boolean {
  const flag = typesenseEnv(name);
  return flag === "1" || flag === "true";
}
