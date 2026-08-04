"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Circle,
  ClipboardList,
} from "lucide-react";
import { TaskCompleteButton } from "@/components/agent/TaskForm";
import { useCarouselSwipe } from "@/components/agent/use-carousel-swipe";
import {
  INQUIRY_TAG_LABEL,
  INQUIRY_TAG_STYLE,
  type InquiryTagValue,
} from "@/lib/agent/inquiry-tag";
import { cn } from "@/lib/utils";

export type LaunchpadTodoItem = {
  id: string;
  title: string;
  body: string | null;
  type: string;
  dueAt: string;
  lead: {
    id: string;
    listingMls: string | null;
    notes: string | null;
    inquiryTag: InquiryTagValue | null;
    customer: { name: string | null; email: string } | null;
  } | null;
};

/** Fixed slide height so Prev/Next doesn’t jump the layout. */
const SLIDE_HEIGHT = "h-[14rem]";

export function LaunchpadTodoCarousel({
  tasks,
  totalOpen,
}: {
  tasks: LaunchpadTodoItem[];
  totalOpen: number;
}) {
  const [index, setIndex] = useState(0);
  const count = tasks.length;

  useEffect(() => {
    setIndex((i) => (count === 0 ? 0 : Math.min(i, count - 1)));
  }, [count]);

  const safeIndex = count === 0 ? 0 : Math.min(index, count - 1);
  const task = count > 0 ? tasks[safeIndex]! : null;
  const overdue = task ? new Date(task.dueAt).getTime() < Date.now() : false;

  function goPrev() {
    setIndex((i) => (count <= 1 ? 0 : (i - 1 + count) % count));
  }

  function goNext() {
    setIndex((i) => (count <= 1 ? 0 : (i + 1) % count));
  }

  const swipe = useCarouselSwipe({
    enabled: count > 1,
    onPrev: goPrev,
    onNext: goNext,
  });

  return (
    <section className="relative z-0 rounded-xl border border-[#d8dee6] border-t-[3px] border-t-[#f59e0b] bg-white shadow-[0_1px_2px_rgb(15_23_42/0.04)] sm:rounded-md">
      <div className="relative z-20 flex items-center justify-between gap-3 border-b border-[#e8edf2] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <ClipboardList className="size-5 shrink-0 text-[#5b6775]" />
          <h2 className="text-[17px] font-semibold text-[#1e2a38]">To Do</h2>
          <span className="truncate text-[13px] text-[#94a3b8]">
            {count === 0
              ? `0 of ${totalOpen}`
              : `${safeIndex + 1} of ${count}${totalOpen > count ? ` · ${totalOpen} open` : ""}`}
          </span>
        </div>
        <Link
          href="/agent/tasks"
          className="shrink-0 rounded border border-[#c7d2e0] px-2.5 py-1 text-[12px] font-bold uppercase tracking-wide text-[#2b6cb0] hover:bg-[#f1f5f9]"
        >
          See all
        </Link>
      </div>

      <div
        className={cn(
          "overflow-y-auto overscroll-contain px-4 py-4",
          SLIDE_HEIGHT,
        )}
        {...swipe}
      >
        {task == null ? (
          <p className="flex h-full items-center justify-center text-center text-[15px] text-[#94a3b8]">
            No reminders or tasks found.
          </p>
        ) : (
          <div className="flex h-full items-start gap-3.5">
            <Circle className="mt-1 size-5 shrink-0 text-[#94a3b8]" />
            <div className="min-w-0 flex-1">
              {task.lead ? (
                <Link
                  href={`/agent/leads?lead=${task.lead.id}`}
                  className="line-clamp-2 block text-[17px] font-semibold leading-snug text-[#2b6cb0] hover:underline"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  {task.title}
                </Link>
              ) : (
                <p className="line-clamp-2 text-[17px] font-semibold leading-snug text-[#1e2a38]">
                  {task.title}
                </p>
              )}
              <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[14px] text-[#5b6775]">
                <span className="truncate">
                  {task.lead?.customer?.name ||
                    task.lead?.customer?.email ||
                    task.type}
                  {task.lead?.listingMls ? ` · ${task.lead.listingMls}` : ""}
                </span>
                {task.lead?.inquiryTag ? (
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-[12px] font-bold",
                      INQUIRY_TAG_STYLE[task.lead.inquiryTag].soft,
                    )}
                  >
                    {INQUIRY_TAG_LABEL[task.lead.inquiryTag]}
                  </span>
                ) : null}
              </p>
              {task.body || task.lead?.notes ? (
                <p className="mt-2 line-clamp-3 text-[14px] leading-relaxed text-[#64748b]">
                  {task.body || task.lead?.notes}
                </p>
              ) : null}
              <p
                className={cn(
                  "mt-2 text-[14px] font-semibold",
                  overdue ? "text-[#e11d48]" : "text-[#64748b]",
                )}
              >
                {new Date(task.dueAt).toLocaleString("en-CA", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            </div>
            <div onPointerDown={(e) => e.stopPropagation()}>
              <TaskCompleteButton taskId={task.id} />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[#e8edf2] px-4 py-2.5">
        <button
          type="button"
          onClick={goPrev}
          disabled={count <= 1}
          className="inline-flex items-center gap-1 rounded-lg border border-[#d8dee6] px-3 py-2 text-[13px] font-semibold text-[#1e2a38] transition hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-35"
          aria-label="Previous to-do"
        >
          <ChevronLeft className="size-4" />
          Prev
        </button>
        <div className="flex items-center gap-1.5" aria-hidden>
          {tasks.map((t, i) => (
            <span
              key={t.id}
              className={cn(
                "size-1.5 rounded-full transition",
                i === safeIndex ? "bg-[#f59e0b]" : "bg-[#d8dee6]",
              )}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={goNext}
          disabled={count <= 1}
          className="inline-flex items-center gap-1 rounded-lg bg-[#2b6cb0] px-3 py-2 text-[13px] font-semibold text-white transition hover:bg-[#245a96] disabled:cursor-not-allowed disabled:opacity-35"
          aria-label="Next to-do"
        >
          Next
          <ChevronRight className="size-4" />
        </button>
      </div>
    </section>
  );
}
