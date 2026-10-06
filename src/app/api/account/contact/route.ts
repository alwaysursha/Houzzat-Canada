import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireCustomerUser } from "@/lib/account";
import {
  applyCanonicalCustomerContact,
} from "@/lib/agent/lead-info-change";
import { logContactActivityForCustomer } from "@/lib/agent/log-contact-activity";
import { scheduleLeadInfoUpdatedForCustomer } from "@/lib/notifications/staff-events";
import { isDatabaseUnavailableError } from "@/lib/errors";
import {
  createRequestId,
  exceptionLogFields,
  jsonApiResponse,
  logJsonApi,
} from "@/lib/http/json-api-response";
import { prisma } from "@/lib/prisma";
import { scheduleCustomerIntroductionIfFirstValidE164 } from "@/lib/sms/automations";
import { parsePhoneColumnsForWrite } from "@/lib/sms/e164";

const ROUTE = "/api/account/contact";

const schema = z
  .object({
    email: z.string().trim().email().max(200).optional(),
    phone: z
      .string()
      .trim()
      .max(40)
      .optional()
      .transform((v) => (v === undefined ? undefined : v || null)),
  })
  .refine((v) => v.email !== undefined || v.phone !== undefined, {
    message: "Provide email and/or phone",
  });

export async function PATCH(request: Request) {
  const requestId = createRequestId();
  const startedAt = Date.now();

  const reply = (status: number, body: unknown, error?: unknown) => {
    try {
      logJsonApi({
        requestId,
        route: ROUTE,
        method: "PATCH",
        status,
        durationMs: Date.now() - startedAt,
        ...exceptionLogFields(error),
      });
    } catch {
      // Logging must never replace a JSON response.
    }
    return jsonApiResponse(body, { status, requestId });
  };

  try {
    let user;
    try {
      user = await requireCustomerUser();
    } catch (error) {
      if (isDatabaseUnavailableError(error)) {
        return reply(503, { error: "Could not save contact info" }, error);
      }
      throw error;
    }
    if (!user) {
      return reply(401, { error: "Sign in required." });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      return reply(400, { error: "Invalid payload" }, error);
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return reply(400, { error: "Invalid payload" });
    }

    const nextEmail =
      parsed.data.email !== undefined
        ? parsed.data.email.toLowerCase()
        : undefined;
    const nextPhone = parsed.data.phone;
    const parsedPhone =
      nextPhone !== undefined ? parsePhoneColumnsForWrite(nextPhone) : null;
    if (parsedPhone && !parsedPhone.ok) {
      return reply(400, { error: parsedPhone.error });
    }

    if (nextEmail && nextEmail !== user.email) {
      const taken = await prisma.user.findFirst({
        where: {
          email: nextEmail,
          workspaceId: user.workspaceId,
        },
        select: { id: true },
      });
      if (taken && taken.id !== user.id) {
        return reply(409, { error: "That email is already in use." });
      }
    }

    const current = await prisma.user.findFirst({
      where: { id: user.id },
      select: { email: true, phone: true, phoneE164: true },
    });
    if (!current) {
      return reply(404, { error: "Not found" });
    }

    const applied = await applyCanonicalCustomerContact(prisma, user.id, {
      email: parsed.data.email,
      phone: parsed.data.phone,
    });
    if (!applied.ok) {
      return reply(applied.status, { error: applied.error });
    }

    const updated = await prisma.user.findFirst({
      where: { id: user.id },
      select: {
        email: true,
        phone: true,
        phoneE164: true,
        emailUpdateRequestedAt: true,
        phoneUpdateRequestedAt: true,
      },
    });
    if (!updated) {
      return reply(404, { error: "Not found" });
    }

    if (applied.changes.length) {
      try {
        await logContactActivityForCustomer({
          customerId: user.id,
          workspaceId: user.workspaceId,
          type: "contact_updated_by_customer",
          body: `Customer updated contact: ${applied.changes.map((c) => c.label).join("; ")}`,
          actorUserId: user.id,
          meta: {
            changes: applied.changes.map((c) => c.label),
          },
        });
      } catch (error) {
        try {
          logJsonApi({
            requestId,
            route: ROUTE,
            method: "PATCH",
            status: 200,
            durationMs: Date.now() - startedAt,
            event: "activity_log_failed",
            ...exceptionLogFields(error),
          });
        } catch {
          // Logging must never replace a JSON response.
        }
      }
    }

    scheduleLeadInfoUpdatedForCustomer({
      customerId: user.id,
      changes: applied.changes,
      actorUserId: user.id,
    });

    if (parsed.data.phone !== undefined) {
      scheduleCustomerIntroductionIfFirstValidE164({
        customerId: user.id,
        previousPhone: current.phone,
        previousPhoneE164: current.phoneE164,
        nextPhone: updated.phone,
        nextPhoneE164: updated.phoneE164,
      });
    }

    return reply(200, {
      ok: true,
      email: updated.email,
      phone: updated.phone,
      needPhone:
        !updated.phone?.trim() || updated.phoneUpdateRequestedAt != null,
      needEmail: updated.emailUpdateRequestedAt != null,
    });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return reply(503, { error: "Could not save contact info" }, error);
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return reply(409, { error: "That email is already in use." }, error);
    }
    return reply(500, { error: "Could not save contact info" }, error);
  }
}
