import type { NextResponse } from "next/server";
import { DESK_AGENT_COOKIE } from "@/lib/agent/desk-constants";

const DESK_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 180;

function deskCookieBase() {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

/** Persist selected desk agent id (or "all") on the response. */
export function setDeskAgentCookie(response: NextResponse, value: string) {
  response.cookies.set(DESK_AGENT_COOKIE, value, {
    ...deskCookieBase(),
    maxAge: DESK_COOKIE_MAX_AGE_SEC,
  });
}

/** Expire desk selection (logout / fresh session). */
export function clearDeskAgentCookie(response: NextResponse) {
  response.cookies.set(DESK_AGENT_COOKIE, "", {
    ...deskCookieBase(),
    maxAge: 0,
    expires: new Date(0),
  });
}

export { DESK_AGENT_COOKIE };
