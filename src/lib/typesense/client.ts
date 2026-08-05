import Typesense from "typesense";
import { typesenseEnv } from "@/lib/typesense/env";

function requiredEnv(
  name:
    | "TYPESENSE_HOST"
    | "TYPESENSE_ADMIN_API_KEY"
    | "TYPESENSE_SEARCH_API_KEY",
): string {
  const value = typesenseEnv(name);
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

export function getTypesenseCollectionName(): string {
  return typesenseEnv("TYPESENSE_COLLECTION") || "listings";
}

function nodeConfig() {
  return {
    host: requiredEnv("TYPESENSE_HOST"),
    port: Number(typesenseEnv("TYPESENSE_PORT") || "443"),
    protocol: typesenseEnv("TYPESENSE_PROTOCOL") || "https",
  };
}

/** Admin client — import, upsert, delete. Server / scripts only. */
export function getTypesenseAdminClient() {
  return new Typesense.Client({
    nodes: [nodeConfig()],
    apiKey: requiredEnv("TYPESENSE_ADMIN_API_KEY"),
    connectionTimeoutSeconds: 15,
  });
}

/** Search-only client — safe for server search routes. */
export function getTypesenseSearchClient() {
  return new Typesense.Client({
    nodes: [nodeConfig()],
    apiKey: requiredEnv("TYPESENSE_SEARCH_API_KEY"),
    connectionTimeoutSeconds: 8,
  });
}
