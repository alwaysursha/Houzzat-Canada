"use client";

import { Fragment, useState } from "react";
import type { PlanMark, PublicPlanCard, PublicPlanCode, PublicPlanRow } from "@/lib/platform/public/platform-plan-presentation";

function Mark({ mark }: { mark: PlanMark }) {
  switch (mark.kind) {
    case "included":
      return <span className="hp-plan-mark is-yes">Included</span>;
    case "unavailable":
      return <span className="hp-plan-mark">Not included</span>;
    case "addon":
      return <span className="hp-plan-mark is-addon">Optional add-on</span>;
    case "label":
      return <span className="text-sm font-semibold text-[#10201c]">{mark.text}</span>;
    default: {
      const exhaustive: never = mark;
      return exhaustive;
    }
  }
}

export function PlanComparison({
  cards,
  rows,
}: {
  cards: readonly PublicPlanCard[];
  rows: readonly PublicPlanRow[];
}) {
  const [selected, setSelected] = useState<PublicPlanCode>("TEAM");
  const groups = rows.reduce<string[]>((list, row) => {
    if (!list.includes(row.group)) list.push(row.group);
    return list;
  }, []);

  return (
    <div id="compare">
      <div className="lg:hidden">
        <div className="grid grid-cols-3 gap-2">
          {cards.map((card) => (
            <button
              key={card.code}
              type="button"
              className={`min-h-12 rounded-2xl px-2 text-sm font-bold ${selected === card.code ? "bg-[#07583f] text-white" : "bg-white text-[#16352c]"}`}
              onClick={() => setSelected(card.code)}
              aria-pressed={selected === card.code}
            >
              {card.name}
            </button>
          ))}
        </div>
        <div className="mt-6 space-y-8">
          {groups.map((group) => (
            <section key={group}>
              <h3 className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#087052]">{group}</h3>
              <ul className="mt-3 divide-y divide-[#e4eee8] overflow-hidden rounded-3xl border border-[#d7e6dc] bg-white">
                {rows.filter((row) => row.group === group).map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-4 px-4 py-3.5">
                    <span className="text-sm text-[#1c3330]">{row.label}</span>
                    <Mark mark={row.marks[selected]} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>

      <div className="hidden lg:block">
        <table className="w-full border-separate border-spacing-0 text-left">
          <thead className="sticky top-[72px] z-20">
            <tr>
              <th className="bg-[#fbfcf9]/95 px-4 py-4 text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#087052] backdrop-blur">Feature</th>
              {cards.map((card) => (
                <th key={card.code} className={`bg-[#fbfcf9]/95 px-4 py-4 backdrop-blur ${card.featured ? "text-[#07583f]" : "text-[#16352c]"}`}>
                  <span className="block text-[11px] font-extrabold uppercase tracking-[0.16em]">{card.eyebrow}</span>
                  <span className="mt-1 block text-lg font-semibold tracking-[-0.03em]">{card.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <Fragment key={group}>
                <tr key={`${group}-head`}>
                  <td colSpan={4} className="px-4 pb-2 pt-8 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#087052]">
                    {group}
                  </td>
                </tr>
                {rows.filter((row) => row.group === group).map((row) => (
                  <tr key={row.id} className="border-b border-[#e7f0eb]">
                    <th className="border-b border-[#e7f0eb] px-4 py-4 text-sm font-semibold text-[#16352c]">{row.label}</th>
                    {cards.map((card) => (
                      <td key={card.code} className={`border-b border-[#e7f0eb] px-4 py-4 ${card.featured ? "bg-[#f3faf6]" : ""}`}>
                        <Mark mark={row.marks[card.code]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
