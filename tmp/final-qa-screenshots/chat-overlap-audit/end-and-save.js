(() => {
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return {
      top: +r.top.toFixed(1),
      bottom: +r.bottom.toFixed(1),
      left: +r.left.toFixed(1),
      right: +r.right.toFixed(1),
      w: +r.width.toFixed(1),
      h: +r.height.toFixed(1),
    };
  };
  const intersects = (a, b) =>
    !(
      a.right <= b.left ||
      a.left >= b.right ||
      a.bottom <= b.top ||
      a.top >= b.bottom
    );

  const chat = document.querySelector("[data-customer-chat-entry]");
  const chatR = rect(chat);
  const articles = Array.from(document.querySelectorAll("article")).filter((a) =>
    a.querySelector('a[href*="listing"]'),
  );
  const last = articles[articles.length - 1];
  const se = document.scrollingElement || document.documentElement;
  se.scrollTop = se.scrollHeight;
  const lastAtEnd = rect(last);
  const grid = document.querySelector(".search-result-grid");

  // Align first card Save under FAB
  window.scrollTo(0, 0);
  const first = articles[0];
  const save = first.querySelector('button[aria-label*="Save" i]');
  const save0 = rect(save);
  window.scrollBy(0, save0.top + save0.h / 2 - (chatR.top + chatR.h / 2));
  const saveR = rect(save);
  const hit = document.elementFromPoint(
    saveR.left + saveR.w / 2,
    saveR.top + saveR.h / 2,
  );

  // Mid card facts under FAB
  const mid = articles[Math.floor(articles.length / 2)];
  mid.scrollIntoView({ block: "center" });
  const mr = mid.getBoundingClientRect();
  window.scrollBy(0, mr.top + mr.height * 0.72 - (chatR.top + chatR.h / 2));
  const facts = Array.from(mid.querySelectorAll('a[href*="listing"]')).find((a) =>
    /\$/.test(a.textContent || ""),
  );
  const factsR = rect(facts);
  const midSave = mid.querySelector('button[aria-label*="Save" i]');
  const midSaveR = rect(midSave);
  const prev = chat.style.pointerEvents;
  chat.style.pointerEvents = "none";
  const under = document.elementFromPoint(
    chatR.left + chatR.w / 2,
    chatR.top + chatR.h / 2,
  );
  chat.style.pointerEvents = prev;

  return {
    viewport: { w: innerWidth, h: innerHeight },
    chat: chatR,
    endOfDocument: {
      lastBottom: lastAtEnd.bottom,
      chatTop: chatR.top,
      clearsAboveChat: lastAtEnd.bottom <= chatR.top - 2,
      gap: +(chatR.top - lastAtEnd.bottom).toFixed(1),
      gridPaddingBottomPx: parseFloat(getComputedStyle(grid).paddingBottom),
      scrollTop: se.scrollTop,
      maxScroll: se.scrollHeight - se.clientHeight,
    },
    saveAlignedUnderFab: {
      save: saveR,
      overlapsChat: intersects(saveR, chatR),
      hitIsChat: !!(hit && hit.closest("[data-customer-chat-entry]")),
      hitIsSave: !!(hit && hit.closest('button[aria-label*="Save" i]')),
      hitAria: hit?.getAttribute?.("aria-label") || hit?.tagName || null,
    },
    midFactsUnderFab: {
      factsOverlapsChat: intersects(factsR, chatR),
      saveOverlapsChat: intersects(midSaveR, chatR),
      under: under
        ? {
            tag: under.tagName,
            isListingLink: !!under.closest('a[href*="listing"]'),
            isSave: !!under.closest('button[aria-label*="Save" i]'),
            text: (under.textContent || "").replace(/\s+/g, " ").trim().slice(0, 50),
          }
        : null,
    },
  };
})()
