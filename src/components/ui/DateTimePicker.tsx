"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"] as const;
const MINUTE_OPTIONS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55] as const;

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function parseIso(value: string | null | undefined) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function roundToMinuteOption(minutes: number) {
  let best: (typeof MINUTE_OPTIONS)[number] = 0;
  let bestDiff = Infinity;
  for (const option of MINUTE_OPTIONS) {
    const diff = Math.abs(option - minutes);
    if (diff < bestDiff) {
      best = option;
      bestDiff = diff;
    }
  }
  return best;
}

function formatDisplay(date: Date | null) {
  if (!date) return "Select date & time";
  return date.toLocaleString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function monthLabel(date: Date) {
  return date.toLocaleString("en-CA", { month: "long", year: "numeric" });
}

function buildMonthCells(view: Date) {
  const first = new Date(view.getFullYear(), view.getMonth(), 1);
  const startOffset = first.getDay();
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - startOffset);

  const cells: Date[] = [];
  for (let i = 0; i < 42; i += 1) {
    const cell = new Date(gridStart);
    cell.setDate(gridStart.getDate() + i);
    cells.push(cell);
  }
  return cells;
}

function combineDateAndTime(
  day: Date,
  hour12: number,
  minute: number,
  meridiem: "AM" | "PM",
) {
  let hour24 = hour12 % 12;
  if (meridiem === "PM") hour24 += 12;
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    hour24,
    minute,
    0,
    0,
  );
}

export function DateTimePicker({
  value,
  onChange,
  className,
  disabled,
}: {
  value: string | null;
  onChange: (nextIso: string | null) => void;
  className?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = useMemo(() => parseIso(value), [value]);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() =>
    startOfDay(selected ?? new Date()),
  );
  const [draftDay, setDraftDay] = useState<Date>(() =>
    startOfDay(selected ?? new Date()),
  );
  const [hour12, setHour12] = useState(() => {
    if (!selected) return 12;
    const h = selected.getHours() % 12;
    return h === 0 ? 12 : h;
  });
  const [minute, setMinute] = useState<number>(() =>
    selected ? roundToMinuteOption(selected.getMinutes()) : 0,
  );
  const [meridiem, setMeridiem] = useState<"AM" | "PM">(() =>
    selected && selected.getHours() >= 12 ? "PM" : "AM",
  );

  useEffect(() => {
    if (!open) return;
    const next = selected ?? new Date();
    setViewMonth(startOfDay(next));
    setDraftDay(startOfDay(next));
    const h = next.getHours() % 12;
    setHour12(h === 0 ? 12 : h);
    setMinute(roundToMinuteOption(next.getMinutes()));
    setMeridiem(next.getHours() >= 12 ? "PM" : "AM");
  }, [open, selected]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const cells = useMemo(() => buildMonthCells(viewMonth), [viewMonth]);
  const today = startOfDay(new Date());

  function commit(day: Date, nextHour12: number, nextMinute: number, nextMeridiem: "AM" | "PM") {
    const next = combineDateAndTime(day, nextHour12, nextMinute, nextMeridiem);
    onChange(next.toISOString());
  }

  function onSelectDay(day: Date) {
    setDraftDay(startOfDay(day));
    commit(day, hour12, minute, meridiem);
  }

  function onHour(next: number) {
    setHour12(next);
    commit(draftDay, next, minute, meridiem);
  }

  function onMinute(next: number) {
    setMinute(next);
    commit(draftDay, hour12, next, meridiem);
  }

  function onMeridiem(next: "AM" | "PM") {
    setMeridiem(next);
    commit(draftDay, hour12, minute, next);
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex h-11 w-full items-center gap-2 rounded-md border border-line bg-mist px-3 text-left text-sm text-ink transition",
          "hover:border-canopy/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canopy/35",
          disabled && "cursor-not-allowed opacity-50",
          open && "border-canopy/50 ring-2 ring-canopy/20",
        )}
      >
        <CalendarDays className="size-4 shrink-0 text-canopy" strokeWidth={2} />
        <span className={cn("min-w-0 flex-1 truncate", !selected && "text-ink/45")}>
          {formatDisplay(selected)}
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-ink/40 transition",
            open && "rotate-180 text-canopy",
          )}
        />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Choose date and time"
          className="absolute left-0 top-[calc(100%+0.5rem)] z-[70] w-[min(100vw-2rem,22.5rem)] overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_18px_40px_-18px_rgba(20,32,28,0.35)] sm:w-[26rem]"
        >
          <div className="grid sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="border-b border-line p-3 sm:border-b-0 sm:border-r">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="font-display text-base text-ink">
                  {monthLabel(viewMonth)}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Previous month"
                    className="inline-flex size-8 items-center justify-center rounded-lg text-ink/60 transition hover:bg-mist hover:text-canopy"
                    onClick={() =>
                      setViewMonth(
                        new Date(
                          viewMonth.getFullYear(),
                          viewMonth.getMonth() - 1,
                          1,
                        ),
                      )
                    }
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next month"
                    className="inline-flex size-8 items-center justify-center rounded-lg text-ink/60 transition hover:bg-mist hover:text-canopy"
                    onClick={() =>
                      setViewMonth(
                        new Date(
                          viewMonth.getFullYear(),
                          viewMonth.getMonth() + 1,
                          1,
                        ),
                      )
                    }
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              </div>

              <div className="mb-1 grid grid-cols-7 gap-1">
                {WEEKDAYS.map((day, index) => (
                  <div
                    key={`${day}-${index}`}
                    className="py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-ink/40"
                  >
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {cells.map((cell) => {
                  const inMonth = cell.getMonth() === viewMonth.getMonth();
                  const isSelected = sameDay(cell, draftDay);
                  const isToday = sameDay(cell, today);
                  return (
                    <button
                      key={cell.toISOString()}
                      type="button"
                      onClick={() => onSelectDay(cell)}
                      className={cn(
                        "flex size-9 items-center justify-center rounded-lg text-sm transition",
                        !inMonth && "text-ink/25",
                        inMonth && !isSelected && "text-ink hover:bg-canopy/10",
                        isToday && !isSelected && "font-semibold text-canopy",
                        isSelected &&
                          "bg-canopy font-semibold text-white shadow-sm hover:bg-canopy-deep",
                      )}
                    >
                      {cell.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex max-h-[19.5rem] gap-1.5 bg-mist/50 p-3">
              <div className="min-h-0 w-[4.25rem] overflow-y-auto rounded-xl border border-line/80 bg-surface p-1">
                <p className="px-1 pb-1 pt-1 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/40">
                  Hour
                </p>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((hour) => (
                  <button
                    key={hour}
                    type="button"
                    onClick={() => onHour(hour)}
                    className={cn(
                      "flex w-full items-center justify-center rounded-md px-1.5 py-1.5 text-sm tabular-nums transition",
                      hour12 === hour
                        ? "bg-canopy font-semibold text-white"
                        : "text-ink/70 hover:bg-canopy/10 hover:text-canopy",
                    )}
                  >
                    {String(hour).padStart(2, "0")}
                  </button>
                ))}
              </div>
              <div className="min-h-0 w-[4.25rem] overflow-y-auto rounded-xl border border-line/80 bg-surface p-1">
                <p className="px-1 pb-1 pt-1 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/40">
                  Min
                </p>
                {MINUTE_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => onMinute(option)}
                    className={cn(
                      "flex w-full items-center justify-center rounded-md px-1.5 py-1.5 text-sm tabular-nums transition",
                      minute === option
                        ? "bg-canopy font-semibold text-white"
                        : "text-ink/70 hover:bg-canopy/10 hover:text-canopy",
                    )}
                  >
                    {String(option).padStart(2, "0")}
                  </button>
                ))}
              </div>
              <div className="w-[3.75rem] rounded-xl border border-line/80 bg-surface p-1">
                <p className="px-1 pb-1 pt-1 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/40">
                  —
                </p>
                {(["AM", "PM"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => onMeridiem(option)}
                    className={cn(
                      "flex w-full items-center justify-center rounded-md px-1.5 py-1.5 text-sm font-medium transition",
                      meridiem === option
                        ? "bg-canopy font-semibold text-white"
                        : "text-ink/70 hover:bg-canopy/10 hover:text-canopy",
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-line bg-mist/40 px-3 py-2.5">
            <button
              type="button"
              className="text-sm font-semibold text-ink/55 transition hover:text-canopy"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              Clear
            </button>
            <button
              type="button"
              className="text-sm font-semibold text-canopy transition hover:text-canopy-deep"
              onClick={() => {
                const now = new Date();
                const rounded = roundToMinuteOption(now.getMinutes());
                const h = now.getHours() % 12 || 12;
                const nextMeridiem = now.getHours() >= 12 ? "PM" : "AM";
                setDraftDay(startOfDay(now));
                setViewMonth(startOfDay(now));
                setHour12(h);
                setMinute(rounded);
                setMeridiem(nextMeridiem);
                commit(now, h, rounded, nextMeridiem);
              }}
            >
              Today
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
