"use client";

import { Calendar, CircleDollarSign, House, Mail, Send, UserRound } from "lucide-react";
import { useEffect, useId, useState, type CSSProperties } from "react";

type Point = { x: number; y: number };
type Hole = { x: number; y: number; w: number; h: number; rx: number };
type Rect = {
  cx: number;
  cy: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
};
type OrbitNode = Point & { id: "user" | "house" | "calendar" | "price" | "mail" | "send" };

const ORBIT_ORDER = [
  "new-lead",
  "property-interest",
  "viewing-requested",
  "price-change",
  "follow-up",
  "listing-alert",
] as const;

const NODE_SIZE = 34;

const NODE_DELAY: Record<OrbitNode["id"], string> = {
  user: "240ms",
  house: "400ms",
  calendar: "560ms",
  mail: "720ms",
  send: "880ms",
  price: "1040ms",
};

function cubic(end: Point, c1: Point, c2: Point): string {
  return `C ${c1.x.toFixed(1)} ${c1.y.toFixed(1)} ${c2.x.toFixed(1)} ${c2.y.toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
}

function pointOf(card: Rect): Point {
  return { x: card.cx, y: card.cy };
}

function through(to: Point, bend: Point): string {
  return cubic(to, bend, bend);
}

function buildOrbit(
  cards: Rect[],
  stageHeight: number,
  phone: { top: number; bottom: number },
): { path: string; nodes: OrbitNode[] } {
  const lead = cards[0];
  const property = cards[1];
  const viewing = cards[2];
  const price = cards[3];
  const follow = cards[4];
  const listing = cards[5];
  if (!lead || !property || !viewing || !price || !follow || !listing) {
    throw new Error("Lead orbit requires all six cards.");
  }
  const leadPt = pointOf(lead);
  const propertyPt = pointOf(property);
  const viewingPt = pointOf(viewing);
  const pricePt = pointOf(price);
  const followPt = pointOf(follow);
  const listingPt = pointOf(listing);
  const user: OrbitNode = {
    id: "user",
    x: lead.cx,
    y: Math.max(22, lead.top - 42),
  };
  const house: OrbitNode = {
    id: "house",
    x: Math.min(lead.cx, property.cx) - 2,
    y: (lead.bottom + property.top) / 2,
  };
  const calendar: OrbitNode = {
    id: "calendar",
    x: Math.min(property.cx, viewing.cx) - 2,
    y: (property.bottom + viewing.top) / 2,
  };
  const dollar: OrbitNode = {
    id: "price",
    x: Math.max(follow.cx, price.cx) + 2,
    y: (follow.bottom + price.top) / 2,
  };
  const plane: OrbitNode = {
    id: "send",
    x: Math.max(listing.cx, follow.cx) + 8,
    y: (listing.bottom + follow.top) / 2,
  };
  const mail: OrbitNode = {
    id: "mail",
    x: listing.cx + 8,
    y: Math.max(24, listing.top - 42),
  };
  const laneBottom = Math.min(stageHeight - 14, Math.max(phone.bottom + 24, calendar.y + 28));
  const leftLow = { x: calendar.x, y: laneBottom };
  const rightLow = { x: price.cx + 6, y: laneBottom };
  const laneTop = Math.max(18, Math.min(mail.y - 4, phone.top - 16));
  const highRight = { x: mail.x, y: laneTop };
  const highLeft = { x: lead.cx, y: laneTop };

  const path = [
    `M ${leadPt.x.toFixed(1)} ${leadPt.y.toFixed(1)}`,
    through(house, { x: leadPt.x - 14, y: (leadPt.y + house.y) / 2 }),
    through(propertyPt, { x: propertyPt.x - 14, y: (house.y + propertyPt.y) / 2 }),
    through(calendar, { x: calendar.x - 10, y: (propertyPt.y + calendar.y) / 2 }),
    through(viewingPt, { x: viewingPt.x - 14, y: (calendar.y + viewingPt.y) / 2 }),
    cubic(
      { x: leftLow.x + 96, y: laneBottom },
      { x: leftLow.x - 4, y: laneBottom - 6 },
      { x: leftLow.x + 40, y: laneBottom },
    ),
    cubic(
      { x: rightLow.x - 96, y: laneBottom },
      { x: leftLow.x + 180, y: laneBottom },
      { x: rightLow.x - 180, y: laneBottom },
    ),
    cubic(
      { x: rightLow.x, y: Math.min(pricePt.y + 78, laneBottom - 36) },
      { x: rightLow.x - 40, y: laneBottom },
      { x: rightLow.x + 4, y: laneBottom - 6 },
    ),
    through(pricePt, { x: pricePt.x + 16, y: (Math.min(pricePt.y + 78, laneBottom - 36) + pricePt.y) / 2 }),
    through(dollar, { x: dollar.x + 12, y: (pricePt.y + dollar.y) / 2 }),
    through(followPt, { x: followPt.x + 18, y: (dollar.y + followPt.y) / 2 }),
    through(plane, { x: plane.x + 8, y: (followPt.y + plane.y) / 2 }),
    through(listingPt, { x: listingPt.x + 16, y: (plane.y + listingPt.y) / 2 }),
    through(mail, { x: mail.x + 10, y: (listingPt.y + mail.y) / 2 }),
    cubic(
      { x: highRight.x - 96, y: laneTop },
      { x: highRight.x + 4, y: laneTop + 6 },
      { x: highRight.x - 40, y: laneTop },
    ),
    cubic(
      { x: highLeft.x + 96, y: laneTop },
      { x: highRight.x - 180, y: laneTop },
      { x: highLeft.x + 180, y: laneTop },
    ),
    cubic(
      { x: highLeft.x, y: Math.max(leadPt.y - 78, laneTop + 36) },
      { x: highLeft.x + 40, y: laneTop },
      { x: highLeft.x - 4, y: laneTop + 6 },
    ),
    through(user, { x: leadPt.x - 12, y: (Math.max(leadPt.y - 78, laneTop + 36) + user.y) / 2 }),
    through(leadPt, { x: leadPt.x - 8, y: (user.y + leadPt.y) / 2 }),
  ].join(" ");

  return { path, nodes: [user, house, calendar, dollar, plane, mail] };
}

function OrbitGlyph({ id }: { id: OrbitNode["id"] }) {
  const className = "h-4 w-4";
  switch (id) {
    case "user":
      return <UserRound className={className} aria-hidden="true" />;
    case "house":
      return <House className={className} aria-hidden="true" />;
    case "calendar":
      return <Calendar className={className} aria-hidden="true" />;
    case "price":
      return <CircleDollarSign className={className} aria-hidden="true" />;
    case "mail":
      return <Mail className={className} aria-hidden="true" />;
    case "send":
      return <Send className={className} aria-hidden="true" />;
    default: {
      const uncovered: never = id;
      return uncovered;
    }
  }
}

export function HomePreviewLeadOrbit() {
  const maskId = useId().replace(/:/g, "");
  const [path, setPath] = useState("");
  const [viewBox, setViewBox] = useState("0 0 748 920");
  const [holes, setHoles] = useState<Hole[]>([]);
  const [nodes, setNodes] = useState<OrbitNode[]>([]);

  useEffect(() => {
    const stage = document.getElementById("hp-lead-orbit-stage");
    if (!stage) return;

    const measure = () => {
      const stageBox = stage.getBoundingClientRect();
      if (stageBox.width < 1 || stageBox.height < 1) return;
      const cards: Rect[] = [];
      const nextHoles: Hole[] = [];
      for (const id of ORBIT_ORDER) {
        const card = stage.querySelector<HTMLElement>(`[data-orbit="${id}"]`);
        if (!card) return;
        const rect = card.getBoundingClientRect();
        const cardRect = {
          cx: rect.left + rect.width / 2 - stageBox.left,
          cy: rect.top + rect.height / 2 - stageBox.top,
          left: rect.left - stageBox.left,
          top: rect.top - stageBox.top,
          right: rect.right - stageBox.left,
          bottom: rect.bottom - stageBox.top,
        };
        cards.push(cardRect);
        nextHoles.push({
          x: cardRect.left,
          y: cardRect.top,
          w: rect.width,
          h: rect.height,
          rx: 16,
        });
      }
      const phoneEl = stage.querySelector(".hp-lead-phone");
      const phoneBox = phoneEl?.getBoundingClientRect();
      const orbit = buildOrbit(cards, stageBox.height, {
        top: phoneBox ? phoneBox.top - stageBox.top : stageBox.height * 0.12,
        bottom: phoneBox ? phoneBox.bottom - stageBox.top : stageBox.height * 0.88,
      });
      const radius = NODE_SIZE / 2;
      for (const node of orbit.nodes) {
        nextHoles.push({
          x: node.x - radius,
          y: node.y - radius,
          w: NODE_SIZE,
          h: NODE_SIZE,
          rx: radius,
        });
      }
      setViewBox(`0 0 ${stageBox.width} ${stageBox.height}`);
      setHoles(nextHoles);
      setNodes(orbit.nodes);
      setPath(orbit.path);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    <>
      <svg
        className="pointer-events-none absolute inset-0 z-0 h-full w-full"
        viewBox={viewBox}
        aria-hidden="true"
      >
        <defs>
          <mask id={maskId}>
            <rect width="100%" height="100%" fill="white" />
            {holes.map((hole) => (
              <rect
                key={`${hole.x}-${hole.y}-${hole.w}`}
                x={hole.x}
                y={hole.y}
                width={hole.w}
                height={hole.h}
                rx={hole.rx}
                fill="black"
              />
            ))}
          </mask>
        </defs>
        {path ? (
          <path
            className="hp-orbit-path"
            data-hp-draw
            d={path}
            fill="none"
            stroke="#087052"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="0.1 9"
            opacity="0.72"
            mask={`url(#${maskId})`}
          />
        ) : null}
      </svg>
      {nodes.map((node) => (
        <div
          key={node.id}
          data-hp-reveal="node"
          className="pointer-events-none absolute z-[15] grid place-items-center rounded-full bg-[#087052] text-white shadow-[0_8px_18px_rgba(8,112,82,.28)]"
          style={{
            width: NODE_SIZE,
            height: NODE_SIZE,
            left: node.x - NODE_SIZE / 2,
            top: node.y - NODE_SIZE / 2,
            "--hp-delay": NODE_DELAY[node.id],
          } as CSSProperties}
        >
          <OrbitGlyph id={node.id} />
        </div>
      ))}
    </>
  );
}
