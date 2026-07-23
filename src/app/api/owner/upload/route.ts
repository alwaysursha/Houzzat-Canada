import { NextResponse } from "next/server";
import { requireOwnerUser } from "@/lib/owner/auth";
import { saveOwnerUpload } from "@/lib/owner/uploads";

export async function POST(request: Request) {
  const user = await requireOwnerUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await request.formData();
  const file = form.get("file");
  const kind = form.get("kind");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File required." }, { status: 400 });
  }
  if (kind !== "licenses" && kind !== "photos") {
    return NextResponse.json({ error: "Invalid upload kind." }, { status: 400 });
  }
  if (file.size > 8_000_000) {
    return NextResponse.json({ error: "File too large (max 8MB)." }, { status: 400 });
  }

  const url = await saveOwnerUpload(file, kind);
  return NextResponse.json({ url });
}
