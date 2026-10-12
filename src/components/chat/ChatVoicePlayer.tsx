"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { formatVoiceDurationMs } from "@/lib/chat/voice-notes/recording-client";
import { cn } from "@/lib/utils";

const SPEEDS = [1, 1.5, 2] as const;

/**
 * Voice playback for light mint/white bubbles — high-contrast controls.
 */
export function ChatVoicePlayer({
  src,
  durationMs,
  unavailable = false,
  tone = "incoming",
}: {
  src: string | null;
  durationMs: number | null;
  unavailable?: boolean;
  tone?: "incoming" | "outgoing";
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [knownDurationMs, setKnownDurationMs] = useState(durationMs ?? 0);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [loading, setLoading] = useState(Boolean(src));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setKnownDurationMs(durationMs ?? 0);
    setCurrentMs(0);
    setPlaying(false);
    setLoading(Boolean(src));
    setError(null);
  }, [src, durationMs]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = SPEEDS[speedIndex] ?? 1;
  }, [speedIndex]);

  if (unavailable || !src) {
    return (
      <div
        className={cn(
          "flex min-w-[12rem] items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-medium",
          tone === "outgoing"
            ? "bg-[#0f6b4c]/10 text-[#1a2e24]"
            : "bg-[#eef2f7] text-[#334155]",
        )}
        role="status"
      >
        Voice note unavailable
      </div>
    );
  }

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      return;
    }
    void audio.play().catch(() => {
      setError("Couldn’t play this voice note.");
      setPlaying(false);
    });
  }

  function onSeek(value: number) {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(value)) return;
    audio.currentTime = value / 1000;
    setCurrentMs(value);
  }

  const progress =
    knownDurationMs > 0
      ? Math.min(100, Math.max(0, (currentMs / knownDurationMs) * 100))
      : 0;

  const accent =
    tone === "outgoing"
      ? {
          shell: "bg-[#0f6b4c]/12 text-[#12241c]",
          play: "bg-[#0f6b4c] text-white hover:bg-[#0c5740]",
          track: "bg-[#0f6b4c]/20",
          fill: "bg-[#0f6b4c]",
          speed: "bg-white text-[#0f6b4c] ring-1 ring-[#0f6b4c]/25",
        }
      : {
          shell: "bg-white text-[#0f172a] ring-1 ring-[#d7e8df]",
          play: "bg-[#0f6b4c] text-white hover:bg-[#0c5740]",
          track: "bg-[#d7e8df]",
          fill: "bg-[#0f6b4c]",
          speed: "bg-[#f4faf7] text-[#1a2e24] ring-1 ring-[#d7e8df]",
        };

  return (
    <div
      className={cn(
        "flex min-w-[13.5rem] max-w-[18rem] items-center gap-2 rounded-xl px-2.5 py-2",
        accent.shell,
      )}
    >
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(event) => {
          const duration = event.currentTarget.duration;
          if (Number.isFinite(duration) && duration > 0) {
            setKnownDurationMs(Math.round(duration * 1000));
          }
          setLoading(false);
        }}
        onTimeUpdate={(event) => {
          setCurrentMs(Math.round(event.currentTarget.currentTime * 1000));
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrentMs(0);
        }}
        onWaiting={() => setLoading(true)}
        onCanPlay={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setError("Couldn’t play this voice note.");
          setPlaying(false);
        }}
      />
      <button
        type="button"
        onClick={togglePlay}
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        className={cn(
          "inline-flex size-10 shrink-0 items-center justify-center rounded-full shadow-sm",
          accent.play,
        )}
      >
        {playing ? (
          <Pause className="size-4 fill-current" aria-hidden />
        ) : (
          <Play className="size-4 fill-current" aria-hidden />
        )}
      </button>
      <div className="min-w-0 flex-1 space-y-1">
        <div
          className={cn(
            "relative h-2.5 overflow-hidden rounded-full",
            accent.track,
          )}
        >
          <div
            className={cn(
              "absolute inset-y-0 left-0 rounded-full transition-[width] duration-100",
              accent.fill,
            )}
            style={{ width: `${progress}%` }}
          />
          <input
            type="range"
            min={0}
            max={Math.max(knownDurationMs, 1)}
            value={Math.min(currentMs, knownDurationMs || 0)}
            aria-label="Seek voice note"
            onChange={(event) => onSeek(Number(event.target.value))}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>
        <div className="flex items-center justify-between gap-2 text-[11px] font-semibold tabular-nums text-[#1a2e24]/75">
          <span>
            {loading
              ? "Loading…"
              : error
                ? error
                : formatVoiceDurationMs(currentMs)}
          </span>
          <span>{formatVoiceDurationMs(knownDurationMs)}</span>
        </div>
      </div>
      <button
        type="button"
        aria-label={`Playback speed ${SPEEDS[speedIndex]}×`}
        onClick={() =>
          setSpeedIndex((index) => (index + 1) % SPEEDS.length)
        }
        className={cn(
          "shrink-0 rounded-md px-1.5 py-1 text-[11px] font-bold tabular-nums",
          accent.speed,
        )}
      >
        {SPEEDS[speedIndex]}×
      </button>
    </div>
  );
}
