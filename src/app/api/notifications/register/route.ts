import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  token: z.string().trim().min(16).max(4096),
  platform: z.enum(["android", "ios", "web"]),
  shell: z.enum(["houzzat", "houzzatpro"]),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid token." }, { status: 400 });
  }

  await prisma.pushDevice.upsert({
    where: { token: parsed.data.token },
    create: {
      userId: session.user.id,
      token: parsed.data.token,
      platform: parsed.data.platform,
      shell: parsed.data.shell,
    },
    update: {
      userId: session.user.id,
      platform: parsed.data.platform,
      shell: parsed.data.shell,
    },
  });

  return NextResponse.json({ ok: true });
}
