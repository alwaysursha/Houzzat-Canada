import { NextResponse } from "next/server";
import { z } from "zod";
import { answerListingQuestion } from "@/lib/listings/grounded-qa";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  question: z.string().trim().min(3).max(400),
});

type Params = { params: Promise<{ mlsNumber: string }> };

export async function POST(request: Request, { params }: Params) {
  const { mlsNumber } = await params;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Ask a short question." }, { status: 400 });
  }

  const listing = await prisma.listing.findUnique({ where: { mlsNumber } });
  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  const result = await answerListingQuestion(listing, parsed.data.question);
  return NextResponse.json(result);
}
