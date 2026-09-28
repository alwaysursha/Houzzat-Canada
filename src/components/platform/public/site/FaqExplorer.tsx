"use client";

import { useMemo, useState } from "react";

export function FaqExplorer({
  groups,
}: {
  groups: readonly { heading: string; items: readonly { q: string; a: string }[] }[];
}) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return groups
      .map((group) => ({
        heading: group.heading,
        items: group.items.filter((item) => {
          if (!needle) return true;
          return `${item.q} ${item.a}`.toLowerCase().includes(needle);
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, query]);

  return (
    <div className="mx-auto w-full max-w-[760px]">
      <label className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-[#087052]" htmlFor="hp-faq-search">
        Search questions
      </label>
      <input
        id="hp-faq-search"
        className="mt-3 h-12 w-full rounded-xl border border-[#d5e4db] bg-white px-4 text-[#143229] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#07583f]"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search"
        type="search"
      />
      {visible.length === 0 ? (
        <p className="mt-6 text-[17px] leading-7 text-[#53635e]">No questions match that search.</p>
      ) : (
        visible.map((group) => (
          <section key={group.heading} className="mt-10">
            <h2 className="text-[1.65rem] font-semibold tracking-[-0.03em] text-[#10201c]">{group.heading}</h2>
            <div className="mt-4 grid gap-3">
              {group.items.map((item) => (
                <details key={item.q} className="rounded-2xl border border-[#d7e6dc] bg-white px-5">
                  <summary className="cursor-pointer py-4 font-semibold text-[#10201c]">{item.q}</summary>
                  <p className="pb-4 text-sm leading-6 text-[#5d726a]">{item.a}</p>
                </details>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
