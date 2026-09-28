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
    <div>
      <label className="hp-pub-kicker" htmlFor="hp-faq-search">
        Search questions
      </label>
      <input
        id="hp-faq-search"
        className="hp-pub-search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search"
        type="search"
      />
      {visible.length === 0 ? (
        <p className="hp-pub-lead">No questions match that search.</p>
      ) : (
        visible.map((group) => (
          <section key={group.heading} className="hp-pub-band">
            <h2>{group.heading}</h2>
            <div className="hp-pub-grid">
              {group.items.map((item) => (
                <details key={item.q} className="hp-pub-faq-item">
                  <summary>{item.q}</summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
