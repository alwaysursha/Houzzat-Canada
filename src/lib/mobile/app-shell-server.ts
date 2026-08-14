import { cookies, headers } from "next/headers";
import {
  APP_SHELL_COOKIE,
  resolveRequestAppShell,
  type AppShell,
} from "@/lib/mobile/app-shell";

/**
 * Shell identity for server components / route handlers (UX only, never
 * authorization). Reads request headers — no Neon/API work. Only usable in
 * dynamic contexts; static routes must not call it.
 */
export async function getRequestAppShell(): Promise<AppShell> {
  const [headerList, cookieStore] = await Promise.all([headers(), cookies()]);
  return resolveRequestAppShell({
    userAgent: headerList.get("user-agent"),
    cookieValue: cookieStore.get(APP_SHELL_COOKIE)?.value,
  });
}
