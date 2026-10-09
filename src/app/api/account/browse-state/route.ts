import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCustomerUser } from "@/lib/account";
import {
  applyBrowseStatePut,
  loadBrowseStateForUser,
} from "@/lib/listings/browse-state-server";

/**
 * Cross-device Active Search + Recent Searches.
 * Sign-in required; email verification NOT required.
 * Never creates SavedSearch / alerts / Primary Home Search.
 */

export async function GET() {
  const user = await requireCustomerUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in required.", requiresAuth: true },
      { status: 401 },
    );
  }
  if (!user.workspaceId) {
    return NextResponse.json(
      { error: "Workspace required for browse sync." },
      { status: 403 },
    );
  }

  try {
    const state = await loadBrowseStateForUser(user);
    return NextResponse.json({ state });
  } catch {
    return NextResponse.json(
      { error: "Browse sync unavailable.", retryable: true },
      { status: 503 },
    );
  }
}

const putSchema = z.object({
  activeSearchHref: z.string().max(1200).nullable().optional(),
  activeUpdatedAt: z.number().finite().nullable().optional(),
  recentSearches: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(160),
        href: z.string().trim().min(1).max(1200),
        at: z.number().finite().positive(),
      }),
    )
    .max(40)
    .optional(),
  expectedRevision: z.number().int().nonnegative().optional(),
  merge: z.boolean().optional(),
});

export async function PUT(request: Request) {
  const user = await requireCustomerUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in required.", requiresAuth: true },
      { status: 401 },
    );
  }
  if (!user.workspaceId) {
    return NextResponse.json(
      { error: "Workspace required for browse sync." },
      { status: 403 },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = putSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid browse state.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Never trust client userId / workspaceId — ownership from session only.
  const result = await applyBrowseStatePut(user, parsed.data);
  if (!result.ok) {
    if (result.error === "conflict") {
      return NextResponse.json(
        { error: result.message, state: result.state ?? null },
        { status: 409 },
      );
    }
    if (result.error === "unavailable") {
      return NextResponse.json(
        { error: result.message, retryable: true },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return NextResponse.json({ state: result.state, wrote: result.wrote });
}
