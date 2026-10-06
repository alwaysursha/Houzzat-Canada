import { z } from "zod";

export const areaMonitorSettingsPatchSchema = z
  .object({
    id: z.string().min(1),
    emailAlerts: z.boolean().optional(),
    notifyNew: z.boolean().optional(),
    notifySold: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.emailAlerts !== undefined ||
      value.notifyNew !== undefined ||
      value.notifySold !== undefined,
    { message: "At least one setting is required." },
  );

export type AreaMonitorSettingsPatchInput = z.infer<
  typeof areaMonitorSettingsPatchSchema
>;

export type AreaMonitorSettingsRow = {
  id: string;
  userId: string;
  emailAlerts: boolean;
  notifyNew: boolean;
  notifySold: boolean;
  city: string;
  community: string | null;
  lastSeenListingAt: Date | null;
  lastAlertedAt: Date | null;
};

export type AreaMonitorSettingsStore = {
  updateSettings(input: {
    userId: string;
    id: string;
    emailAlerts?: boolean;
    notifyNew?: boolean;
    notifySold?: boolean;
  }): Promise<AreaMonitorSettingsRow | null>;
};

export function areaMonitorSettingsPatchData(
  input: AreaMonitorSettingsPatchInput,
): {
  emailAlerts?: boolean;
  notifyNew?: boolean;
  notifySold?: boolean;
} {
  const data: {
    emailAlerts?: boolean;
    notifyNew?: boolean;
    notifySold?: boolean;
  } = {};
  if (input.emailAlerts !== undefined) data.emailAlerts = input.emailAlerts;
  if (input.notifyNew !== undefined) data.notifyNew = input.notifyNew;
  if (input.notifySold !== undefined) data.notifySold = input.notifySold;
  return data;
}

/**
 * Owned AreaMonitor notification-settings mutation. Never updates by id alone.
 * Only supplied fields are written.
 */
export async function patchAreaMonitorSettings(
  store: AreaMonitorSettingsStore,
  input: {
    userId: string;
    id: string;
    emailAlerts?: boolean;
    notifyNew?: boolean;
    notifySold?: boolean;
  },
): Promise<
  | {
      ok: true;
      item: Pick<
        AreaMonitorSettingsRow,
        "id" | "emailAlerts" | "notifyNew" | "notifySold"
      >;
    }
  | { ok: false; error: "not_found" }
> {
  const row = await store.updateSettings(input);
  if (!row) return { ok: false, error: "not_found" };
  return {
    ok: true,
    item: {
      id: row.id,
      emailAlerts: row.emailAlerts,
      notifyNew: row.notifyNew,
      notifySold: row.notifySold,
    },
  };
}

export function memoryAreaMonitorSettingsStore(
  rows: AreaMonitorSettingsRow[],
): AreaMonitorSettingsStore & { rows: AreaMonitorSettingsRow[] } {
  return {
    rows,
    async updateSettings(input) {
      const row = rows.find(
        (item) => item.id === input.id && item.userId === input.userId,
      );
      if (!row) return null;
      if (input.emailAlerts !== undefined) row.emailAlerts = input.emailAlerts;
      if (input.notifyNew !== undefined) row.notifyNew = input.notifyNew;
      if (input.notifySold !== undefined) row.notifySold = input.notifySold;
      return { ...row };
    },
  };
}
