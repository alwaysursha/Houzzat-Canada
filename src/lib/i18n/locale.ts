import { cookies } from "next/headers";
import { isLocale, type Locale } from "@/lib/i18n/dictionaries";

export const LOCALE_COOKIE = "houzzat_locale";

export async function getLocale(): Promise<Locale> {
  const jar = await cookies();
  const value = jar.get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : "en";
}
