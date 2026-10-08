(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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

  const chat = document.querySelector('[data-customer-chat-entry]');
  const chatR = rect(chat);
  const articles = Array.from(document.querySelectorAll("article")).filter((a) =>
    a.querySelector('a[href*="listing"]'),
  );
  if (!chatR || articles.length === 0) {
    return { error: "missing chat or cards", chat: !!chatR, cards: articles.length };
  }

  const probeCard = (article, label) => {
    const save = article.querySelector(
      'button[aria-label*="Save" i], button[aria-label*="saved" i], button[aria-label*="Remove saved" i]',
    );
    const price = Array.from(article.querySelectorAll("p, span, div")).find((el) =>
      /^\$[\d,]+$/.test((el.textContent || "").trim()),
    );
    const link = article.querySelector('a[href*="listing"]');
    const saveR = rect(save);
    const priceR = rect(price);
    const linkR = rect(link);
    const cardR = rect(article);

    // Hit-test center of save if present
    let saveHitOk = null;
    if (save && saveR) {
      const cx = saveR.left + saveR.w / 2;
      const cy = saveR.top + saveR.h / 2;
      const el = document.elementFromPoint(cx, cy);
      saveHitOk = !!(el && (el === save || save.contains(el) || el.closest("button") === save));
    }

    // Hit-test a point on card body left of FAB (should open listing)
    let listingHitLeft = null;
    if (linkR) {
      const cx = Math.min(linkR.left + 40, chatR.left - 8);
      const cy = Math.min(Math.max(linkR.top + 40, 10), innerHeight - 10);
      const el = document.elementFromPoint(cx, cy);
      listingHitLeft = {
        ok: !!(el && el.closest('a[href*="listing"]')),
        under: el
          ? {
              tag: el.tagName,
              href: el.closest("a")?.getAttribute("href") || null,
            }
          : null,
      };
    }

    // Hit-test through FAB center with chat disabled
    let listingHitUnderFab = null;
    {
      const prev = chat.style.pointerEvents;
      chat.style.pointerEvents = "none";
      const el = document.elementFromPoint(
        chatR.left + chatR.w / 2,
        chatR.top + chatR.h / 2,
      );
      chat.style.pointerEvents = prev;
      listingHitUnderFab = {
        wouldHitListing: !!(el && el.closest('a[href*="listing"]')),
        wouldHitSave: !!(el && el.closest('button[aria-label*="Save" i]')),
        under: el
          ? {
              tag: el.tagName,
              href: el.closest("a")?.getAttribute("href") || null,
              aria: el.getAttribute("aria-label"),
            }
          : null,
      };
    }

    return {
      label,
      mls: (link?.getAttribute("href") || "").split("/").pop(),
      card: cardR,
      save: saveR,
      price: priceR,
      overlaps: {
        card: intersects(cardR, chatR),
        save: intersects(saveR, chatR),
        price: intersects(priceR, chatR),
        link: intersects(linkR, chatR),
      },
      saveHitOk,
      listingHitLeft,
      listingHitUnderFab,
    };
  };

  // Align a target element's vertical mid with chat mid (scroll into FAB column)
  const scrollSoOverlapsChat = async (el) => {
    const r = el.getBoundingClientRect();
    const targetY = chatR.top + chatR.h / 2 - r.height * 0.65;
    const delta = r.top - targetY;
    window.scrollBy(0, delta);
    await sleep(350);
  };

  const indices = [
    { i: 0, label: "first" },
    { i: Math.floor((articles.length - 1) / 2), label: "middle" },
    { i: articles.length - 1, label: "last" },
  ];

  const results = [];
  for (const { i, label } of indices) {
    const article = articles[i];
    article.scrollIntoView({ block: "center" });
    await sleep(300);
    await scrollSoOverlapsChat(article);
    results.push(probeCard(article, label));
  }

  // Also measure end-of-list clearance: can last card bottom clear above FAB?
  articles[articles.length - 1].scrollIntoView({ block: "end" });
  await sleep(300);
  const last = articles[articles.length - 1];
  const lastR = rect(last);
  const grid = document.querySelector(".search-result-grid");
  const pb = grid ? parseFloat(getComputedStyle(grid).paddingBottom) : null;

  return {
    viewport: { w: innerWidth, h: innerHeight },
    chat: chatR,
    scrollProbes: results,
    endOfList: {
      lastCardBottom: lastR?.bottom,
      chatTop: chatR.top,
      lastClearsAboveChat: !!(lastR && lastR.bottom <= chatR.top - 4),
      gapLastBottomToChatTop: lastR ? +(chatR.top - lastR.bottom).toFixed(1) : null,
      gridPaddingBottomPx: pb,
    },
  };
})()
