import { z } from "zod";

export const propertyMonitorEmailPatchSchema = z
  .object({
    mlsNumber: z.string().trim().min(1),
    emailAlerts: z.boolean(),
  })
  .strict();

export type PropertyMonitorEmailPatchInput = z.infer<
  typeof propertyMonitorEmailPatchSchema
>;

export type PropertyMonitorSettingsRow = {
  id: string;
  userId: string;
  mlsNumber: string;
  emailAlerts: boolean;
  lastKnownPrice: number;
  lastKnownStatus: string;
  lastKnownOwnerStatus: string | null;
  lastAlertedAt: Date | null;
};

export type PropertyMonitorSettingsStore = {
  updateEmailAlerts(input: {
    userId: string;
    mlsNumber: string;
    emailAlerts: boolean;
  }): Promise<PropertyMonitorSettingsRow | null>;
};

/**
 * Create defaults emailAlerts to true when omitted.
 * Re-watch/update preserves the existing value unless explicitly supplied.
 */
export function resolvePropertyMonitorEmailAlertsOnUpsert(input: {
  existingEmailAlerts: boolean | null;
  supplied?: boolean;
}): boolean {
  if (input.supplied !== undefined) return input.supplied;
  if (input.existingEmailAlerts !== null) return input.existingEmailAlerts;
  return true;
}

/**
 * Owned PropertyMonitor emailAlerts mutation. Never updates by MLS alone.
 */
export async function patchPropertyMonitorEmailAlerts(
  store: PropertyMonitorSettingsStore,
  input: {
    userId: string;
    mlsNumber: string;
    emailAlerts: boolean;
  },
): Promise<
  | { ok: true; item: Pick<PropertyMonitorSettingsRow, "id" | "mlsNumber" | "emailAlerts"> }
  | { ok: false; error: "not_found" }
> {
  const row = await store.updateEmailAlerts(input);
  if (!row) return { ok: false, error: "not_found" };
  return {
    ok: true,
    item: {
      id: row.id,
      mlsNumber: row.mlsNumber,
      emailAlerts: row.emailAlerts,
    },
  };
}

export function memoryPropertyMonitorSettingsStore(
  rows: PropertyMonitorSettingsRow[],
): PropertyMonitorSettingsStore & { rows: PropertyMonitorSettingsRow[] } {
  return {
    rows,
    async updateEmailAlerts(input) {
      const row = rows.find(
        (item) =>
          item.userId === input.userId && item.mlsNumber === input.mlsNumber,
      );
      if (!row) return null;
      row.emailAlerts = input.emailAlerts;
      return { ...row };
    },
  };
}
