/**
 * Shared multipart parsing helpers for voice-note upload routes.
 */

export async function readVoiceNoteMultipart(request: Request): Promise<
  | {
      ok: true;
      bytes: Uint8Array;
      mimeType: string | null;
      durationMs: number | null;
      uploadId: string | null;
      replyToMessageId: string | null;
    }
  | { ok: false; error: string }
> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return { ok: false, error: "Expected multipart form data" };
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return { ok: false, error: "Invalid form data" };
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "Missing audio file" };
  }
  const buffer = new Uint8Array(await file.arrayBuffer());
  const durationRaw = form.get("durationMs");
  const durationMs =
    typeof durationRaw === "string" && durationRaw.trim()
      ? Number.parseInt(durationRaw, 10)
      : null;
  const uploadRaw = form.get("uploadId");
  const replyRaw = form.get("replyToMessageId");

  return {
    ok: true,
    bytes: buffer,
    mimeType: file.type || null,
    durationMs: Number.isFinite(durationMs) ? durationMs : null,
    uploadId: typeof uploadRaw === "string" ? uploadRaw : null,
    replyToMessageId: typeof replyRaw === "string" ? replyRaw : null,
  };
}
