/**
 * Stage 6.8A — minimal markdown → React for HouzzatPRO legal docs.
 * Supports paragraphs, ## headings, and "- " bullet lists only.
 */

import type { ReactNode } from "react";

export function renderSimpleLegalMarkdown(markdown: string): ReactNode[] {
  const blocks = markdown
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  return blocks.map((block, index) => {
    if (block.startsWith("## ")) {
      return <h2 key={index}>{block.slice(3).trim()}</h2>;
    }
    if (block.split("\n").every((line) => line.trim().startsWith("- "))) {
      const items = block
        .split("\n")
        .map((line) => line.replace(/^- /, "").trim())
        .filter(Boolean);
      return (
        <ul key={index}>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    }
    return <p key={index}>{block.replace(/\n/g, " ")}</p>;
  });
}
