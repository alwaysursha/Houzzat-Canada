"use client";

import { useCallback, useState, type CSSProperties, type ReactNode } from "react";
import { HomeNearMeRail } from "@/components/home/HomeNearMeRail";
import { PersonalizeHomepageBar } from "@/components/home/PersonalizeHomepageBar";
import type { HomepagePersonalizationQuery } from "@/lib/listings/homepage-personalization";

export type HomepageRailSection = {
  id: string;
  resultCount: number;
  node: ReactNode;
};

type NearMeState = {
  /** false when geo denied / unavailable — omit from layout */
  visible: boolean;
  resultCount: number;
};

export function HomepageSortedRails({
  reorderEmptyLast,
  personalization,
  sections,
  cities = [],
}: {
  /** When true, rails with 0 results sort after rails with results (stable). */
  reorderEmptyLast: boolean;
  personalization: HomepagePersonalizationQuery | null;
  /** Default-order listing rails; Near me is inserted after `recently-viewed`. */
  sections: HomepageRailSection[];
  cities?: string[];
}) {
  const [nearMe, setNearMe] = useState<NearMeState>({
    // Pending: keep original slot until we know (treat as non-empty for order).
    visible: true,
    resultCount: 1,
  });

  const onNearMeStatusChange = useCallback(
    (status: "ready" | "empty" | "hidden", count = 0) => {
      if (status === "hidden") {
        setNearMe({ visible: false, resultCount: 0 });
        return;
      }
      if (status === "empty") {
        setNearMe({ visible: true, resultCount: 0 });
        return;
      }
      setNearMe({ visible: true, resultCount: Math.max(count, 1) });
    },
    [],
  );

  const rails: HomepageRailSection[] = [];
  let nearMeInserted = false;
  for (const section of sections) {
    rails.push(section);
    if (section.id === "recently-viewed") {
      rails.push({
        id: "near-me",
        resultCount: nearMe.resultCount,
        node: (
          <HomeNearMeRail
            personalization={personalization}
            onStatusChange={onNearMeStatusChange}
          />
        ),
      });
      rails.push({
        id: "personalize-homepage",
        resultCount: 1,
        node: <PersonalizeHomepageBar cities={cities} />,
      });
      nearMeInserted = true;
    }
  }
  if (!nearMeInserted) {
    rails.unshift(
      {
        id: "near-me",
        resultCount: nearMe.resultCount,
        node: (
          <HomeNearMeRail
            personalization={personalization}
            onStatusChange={onNearMeStatusChange}
          />
        ),
      },
      {
        id: "personalize-homepage",
        resultCount: 1,
        node: <PersonalizeHomepageBar cities={cities} />,
      },
    );
  }

  return (
    <div className="flex flex-col gap-10 sm:gap-16">
      {rails.map((section, index) => {
        if (section.id === "near-me" && !nearMe.visible) {
          return (
            <div key={section.id} className="hidden">
              {section.node}
            </div>
          );
        }
        const emptyRank = section.resultCount > 0 ? 0 : 1;
        const style: CSSProperties | undefined = reorderEmptyLast
          ? { order: emptyRank * 1000 + index }
          : { order: index };
        return (
          // Collapse when a rail returns null (e.g. no recently viewed) so
          // flex gap does not leave a blank strip above the next section.
          <div key={section.id} className="empty:hidden" style={style}>
            {section.node}
          </div>
        );
      })}
    </div>
  );
}
