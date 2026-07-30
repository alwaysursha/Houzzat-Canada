"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type ValuationFaqItem = {
  question: string;
  answer: string;
};

export function ValuationFaqSection({
  title,
  items,
}: {
  title: string;
  items: ValuationFaqItem[];
}) {
  const baseId = useId();
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="space-y-5" aria-labelledby={`${baseId}-heading`}>
      <h2
        id={`${baseId}-heading`}
        className="font-display text-2xl tracking-tight text-ink sm:text-3xl"
      >
        {title}
      </h2>
      <div className="divide-y divide-line/80 border-y border-line/80">
        {items.map((item, index) => {
          const open = openIndex === index;
          const panelId = `${baseId}-panel-${index}`;
          const buttonId = `${baseId}-btn-${index}`;
          return (
            <div key={item.question}>
              <h3>
                <button
                  id={buttonId}
                  type="button"
                  aria-expanded={open}
                  aria-controls={panelId}
                  className="flex w-full items-center justify-between gap-4 py-4 text-left transition hover:text-canopy"
                  onClick={() => setOpenIndex(open ? null : index)}
                >
                  <span className="text-base font-semibold text-ink sm:text-lg">
                    {item.question}
                  </span>
                  <ChevronDown
                    className={cn(
                      "size-5 shrink-0 text-canopy transition-transform duration-300",
                      open && "rotate-180",
                    )}
                    aria-hidden
                  />
                </button>
              </h3>
              <div
                id={panelId}
                role="region"
                aria-labelledby={buttonId}
                className={cn(
                  "grid transition-[grid-template-rows] duration-300 ease-out",
                  open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                )}
              >
                <div className="overflow-hidden">
                  <p className="pb-4 text-[15px] leading-relaxed text-ink/70">
                    {item.answer}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
