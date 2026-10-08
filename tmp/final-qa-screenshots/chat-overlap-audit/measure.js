(() => {
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: +r.x.toFixed(1),
      y: +r.y.toFixed(1),
      w: +r.width.toFixed(1),
      h: +r.height.toFixed(1),
      top: +r.top.toFixed(1),
      left: +r.left.toFixed(1),
      right: +r.right.toFixed(1),
      bottom: +r.bottom.toFixed(1),
    };
  };
  const intersects = (a, b) =>
    !!(a && b) &&
    !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
  const overlapArea = (a, b) => {
    if (!intersects(a, b)) return 0;
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return +(w * h).toFixed(1);
  };

  const chat = document.querySelector(
    '[data-customer-chat-entry], button[aria-label*="Chat" i], a[aria-label*="Chat" i]',
  );

  const bottomNav = Array.from(document.querySelectorAll("nav, footer, div")).find((el) => {
    const r = el.getBoundingClientRect();
    const cls = (el.className || "").toString();
    return (
      r.bottom >= innerHeight - 2 &&
      r.top > innerHeight - 120 &&
      r.width >= innerWidth * 0.85 &&
      /fixed|bottom/i.test(cls)
    );
  });

  const articles = Array.from(document.querySelectorAll("article")).filter((a) =>
    a.querySelector('a[href*="listing"]'),
  );
  const first = articles[0];
  if (!first) return { error: "no card", vw: innerWidth, vh: innerHeight };

  const img = first.querySelector("img");
  const save = first.querySelector(
    'button[aria-label*="Save" i], button[aria-label*="saved" i], button[aria-label*="Remove saved" i]',
  );
  const price = Array.from(first.querySelectorAll("p, span, div")).find((el) => {
    const t = (el.textContent || "").trim();
    return /^\$[\d,]+$/.test(t);
  });
  const title = Array.from(first.querySelectorAll("p, span, h2, h3")).find((el) => {
    const t = (el.textContent || "").trim();
    return (
      t.length > 8 &&
      t.length < 80 &&
      /(Lane|Street|Avenue|Drive|Road|Blvd|Crescent|Trail|Way|Court|Place)/i.test(t)
    );
  });
  const viewDetails = Array.from(first.querySelectorAll("a, button")).find((el) =>
    /View Details|Contact|Request/i.test(el.textContent || ""),
  );
  const cardLink = first.querySelector('a[href*="listing"]');

  const chatR = rect(chat);
  const cardR = rect(first);
  const imgR = rect(img);
  const saveR = rect(save);
  const priceR = rect(price);
  const titleR = rect(title);
  const actionR = rect(viewDetails);
  const navR = rect(bottomNav);
  const linkR = rect(cardLink);

  let underFab = null;
  if (chat && chatR) {
    const cx = chatR.left + chatR.w / 2;
    const cy = chatR.top + chatR.h / 2;
    const prev = chat.style.pointerEvents;
    chat.style.pointerEvents = "none";
    const el = document.elementFromPoint(cx, cy);
    chat.style.pointerEvents = prev;
    underFab = el
      ? {
          tag: el.tagName,
          aria: el.getAttribute("aria-label"),
          href: el.closest("a")?.getAttribute("href") || null,
          text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80),
          isSave: !!el.closest('button[aria-label*="Save" i], button[aria-label*="saved" i]'),
          isCardLink: !!el.closest('a[href*="listing"]'),
          isInteractive: !!el.closest("a,button,input,select,textarea,[role=button]"),
        }
      : null;
  }

  const grid = document.querySelector(".search-result-grid");
  const gridCs = grid ? getComputedStyle(grid) : null;
  const pbPx = grid ? parseFloat(gridCs.paddingBottom) : null;

  return {
    viewport: { w: innerWidth, h: innerHeight },
    boxes: {
      chat: chatR,
      card: cardR,
      image: imgR,
      save: saveR,
      price: priceR,
      title: titleR
        ? { ...titleR, text: (title.textContent || "").trim().slice(0, 60) }
        : null,
      viewDetailsOrContact: actionR,
      cardLink: linkR,
      bottomNav: navR,
    },
    overlaps: {
      card: { intersects: intersects(cardR, chatR), area: overlapArea(cardR, chatR) },
      image: { intersects: intersects(imgR, chatR), area: overlapArea(imgR, chatR) },
      save: { intersects: intersects(saveR, chatR), area: overlapArea(saveR, chatR) },
      price: { intersects: intersects(priceR, chatR), area: overlapArea(priceR, chatR) },
      title: { intersects: intersects(titleR, chatR), area: overlapArea(titleR, chatR) },
      viewDetailsOrContact: {
        intersects: intersects(actionR, chatR),
        area: overlapArea(actionR, chatR),
      },
      cardLinkHitArea: {
        intersects: intersects(linkR || cardR, chatR),
        area: overlapArea(linkR || cardR, chatR),
      },
    },
    underFab,
    clearance: {
      applied: !!(grid && pbPx > 40),
      gridPaddingBottom: gridCs?.paddingBottom || null,
      gridPaddingBottomPx: pbPx,
      cssVarMobileBottomNav:
        getComputedStyle(document.documentElement)
          .getPropertyValue("--mobile-bottom-nav")
          .trim() || "(empty)",
      hasSearchResultGrid: !!grid,
      cardCount: articles.length,
    },
  };
})()
