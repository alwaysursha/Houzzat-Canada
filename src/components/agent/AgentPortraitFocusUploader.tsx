"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { createEmailHeadshotFile } from "@/lib/tenancy/branding-assets/email-headshot";

const ASPECT = 3 / 4;
const OUTPUT_WIDTH = 1200;
const OUTPUT_HEIGHT = 1600;
const OUTPUT_QUALITY = 0.92;

type Draft = {
  url: string;
  naturalWidth: number;
  naturalHeight: number;
  /** Zoom relative to cover scale (1 = cover crop frame). */
  zoom: number;
  /** Pan offsets in CSS pixels inside the stage. */
  offsetX: number;
  offsetY: number;
};

function coverScale(
  naturalWidth: number,
  naturalHeight: number,
  frameW: number,
  frameH: number,
) {
  return Math.max(frameW / naturalWidth, frameH / naturalHeight);
}

async function exportCroppedJpeg(draft: Draft, frameW: number, frameH: number) {
  const img = await loadImage(draft.url);
  const base = coverScale(
    draft.naturalWidth,
    draft.naturalHeight,
    frameW,
    frameH,
  );
  const scale = base * draft.zoom;
  const drawnW = draft.naturalWidth * scale;
  const drawnH = draft.naturalHeight * scale;
  const left = (frameW - drawnW) / 2 + draft.offsetX;
  const top = (frameH - drawnH) / 2 + draft.offsetY;

  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_WIDTH;
  canvas.height = OUTPUT_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  // Map the visible crop frame back into natural image pixels.
  const sx = -left / scale;
  const sy = -top / scale;
  const sw = frameW / scale;
  const sh = frameH / scale;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (next) => (next ? resolve(next) : reject(new Error("Export failed"))),
      "image/jpeg",
      OUTPUT_QUALITY,
    );
  });
  return new File([blob], "agent-profile.jpg", { type: "image/jpeg" });
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = url;
  });
}

/**
 * Phase 3D.3 — best-effort 240×240 circular PNG from the cropped 1200×1600 JPEG.
 * Focus/pan/zoom are already baked into the export, so default headshot framing applies.
 * Failure returns null; the canonical profile upload must still proceed.
 */
async function maybeCreateEmailHeadshot(profileFile: File): Promise<File | null> {
  const url = URL.createObjectURL(profileFile);
  try {
    const img = await loadImage(url);
    return await createEmailHeadshotFile(img);
  } catch (error) {
    console.warn("[agent-portrait] email headshot generation failed", error);
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * High-quality agent portrait upload with drag-to-focus + zoom.
 * Crops to 3:4 at 1200×1600 JPEG before the parent uploads.
 */
export function AgentPortraitFocusUploader({
  photoUrl,
  userId,
  disabled = false,
  onUploaded,
}: {
  photoUrl: string | null;
  /** Target agent userId when a manager edits another member; omit for self. */
  userId?: string;
  /** @deprecated Kept for call-site compatibility; CRM auth uses session workspace. */
  workspaceId?: string;
  disabled?: boolean;
  onUploaded: (nextUrl: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  useEffect(() => {
    return () => {
      if (draft?.url.startsWith("blob:")) URL.revokeObjectURL(draft.url);
    };
  }, [draft?.url]);

  function closeDraft() {
    setDraft((current) => {
      if (current?.url.startsWith("blob:")) URL.revokeObjectURL(current.url);
      return null;
    });
    setError(null);
  }

  async function onFile(file: File) {
    setError(null);
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      if (img.naturalWidth < 400 || img.naturalHeight < 500) {
        URL.revokeObjectURL(url);
        setError("Use a photo at least 400×500 pixels.");
        return;
      }
      setDraft({
        url,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        zoom: 1,
        offsetX: 0,
        offsetY: 0,
      });
    } catch {
      URL.revokeObjectURL(url);
      setError("Could not read that image.");
    }
  }

  async function confirmCrop() {
    if (!draft || !stageRef.current) return;
    setBusy(true);
    setError(null);
    try {
      const rect = stageRef.current.getBoundingClientRect();
      const file = await exportCroppedJpeg(draft, rect.width, rect.height);
      // Best-effort sibling thumb; never blocks canonical JPEG upload.
      const emailHeadshot = await maybeCreateEmailHeadshot(file);
      const body = new FormData();
      body.set("file", file);
      if (emailHeadshot) body.set("emailHeadshot", emailHeadshot);
      if (userId?.trim()) body.set("userId", userId.trim());
      const res = await fetch("/api/agent/profile/photo", {
        method: "POST",
        body,
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
        agentProfilePhotoUrl?: string | null;
        image?: string | null;
      };
      if (!res.ok || !json.ok) {
        setError(json.error || json.message || "Upload failed.");
        return;
      }
      onUploaded(json.image ?? json.agentProfilePhotoUrl ?? null);
      closeDraft();
    } catch {
      setError("Could not save this photo.");
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto() {
    if (!photoUrl || disabled) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/agent/profile/photo", {
        method: "DELETE",
        headers: userId?.trim()
          ? { "Content-Type": "application/json" }
          : undefined,
        body: userId?.trim()
          ? JSON.stringify({ userId: userId.trim() })
          : undefined,
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
        agentProfilePhotoUrl?: string | null;
        image?: string | null;
      };
      if (!res.ok || !json.ok) {
        setError(json.error || json.message || "Could not remove photo.");
        return;
      }
      onUploaded(json.image ?? json.agentProfilePhotoUrl ?? null);
    } catch {
      setError("Could not remove photo.");
    } finally {
      setBusy(false);
    }
  }

  const frameW = 240;
  const frameH = frameW / ASPECT;
  const previewScale = draft
    ? coverScale(draft.naturalWidth, draft.naturalHeight, frameW, frameH) *
      draft.zoom
    : 1;

  return (
    <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-canopy">
        Profile photo
      </p>
      <p className="mt-1 text-sm text-ink/55">
        Your profile photo. Drag to set focus, then zoom in on the face before
        saving. The primary agent&apos;s photo also stays on the public website.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <div className="relative aspect-[3/4] w-28 overflow-hidden rounded-2xl bg-mist">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-top"
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center px-2 text-center text-[11px] text-ink/35">
              No photo
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={disabled || busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void onFile(file);
            }}
          />
          <Button
            type="button"
            disabled={disabled || busy}
            onClick={() => inputRef.current?.click()}
          >
            {photoUrl ? "Change photo" : "Upload photo"}
          </Button>
          {photoUrl ? (
            <Button
              type="button"
              variant="secondary"
              disabled={disabled || busy}
              onClick={() => void removePhoto()}
            >
              Remove
            </Button>
          ) : null}
        </div>
      </div>
      {error && !draft ? (
        <p className="mt-3 text-sm text-[#b91c1c]">{error}</p>
      ) : null}

      {draft ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-ink/50 px-4 py-6 backdrop-blur-[2px]">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="agent-portrait-crop-title"
            className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-2xl"
          >
            <h2
              id="agent-portrait-crop-title"
              className="font-display text-xl text-ink"
            >
              Adjust focus
            </h2>
            <p className="mt-1 text-sm text-ink/55">
              Drag the photo to centre the face, then zoom.
            </p>

            <div
              ref={stageRef}
              className="relative mx-auto mt-4 touch-none overflow-hidden rounded-2xl bg-mist"
              style={{ width: frameW, height: frameH }}
              onPointerDown={(event) => {
                if (!draft) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                dragRef.current = {
                  pointerId: event.pointerId,
                  startX: event.clientX,
                  startY: event.clientY,
                  originX: draft.offsetX,
                  originY: draft.offsetY,
                };
              }}
              onPointerMove={(event) => {
                const drag = dragRef.current;
                if (!drag || drag.pointerId !== event.pointerId) return;
                setDraft((current) =>
                  current
                    ? {
                        ...current,
                        offsetX: drag.originX + (event.clientX - drag.startX),
                        offsetY: drag.originY + (event.clientY - drag.startY),
                      }
                    : current,
                );
              }}
              onPointerUp={(event) => {
                if (dragRef.current?.pointerId === event.pointerId) {
                  dragRef.current = null;
                }
              }}
              onPointerCancel={() => {
                dragRef.current = null;
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={draft.url}
                alt=""
                draggable={false}
                className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
                style={{
                  width: draft.naturalWidth * previewScale,
                  height: draft.naturalHeight * previewScale,
                  transform: `translate(calc(-50% + ${draft.offsetX}px), calc(-50% + ${draft.offsetY}px))`,
                }}
              />
              <div className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-canopy/70" />
            </div>

            <label className="mt-4 block text-xs font-semibold text-ink/70">
              Zoom
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={draft.zoom}
                onChange={(event) =>
                  setDraft((current) =>
                    current
                      ? { ...current, zoom: Number(event.target.value) }
                      : current,
                  )
                }
                className="mt-2 w-full accent-canopy"
              />
            </label>

            {error ? (
              <p className="mt-3 text-sm text-[#b91c1c]">{error}</p>
            ) : null}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={closeDraft}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={busy}
                onClick={() => void confirmCrop()}
              >
                {busy ? "Saving…" : "Save photo"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
