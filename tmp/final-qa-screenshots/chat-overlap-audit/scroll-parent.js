(() => {
  const grid = document.querySelector(".search-result-grid");
  const chat = document.querySelector("[data-customer-chat-entry]");
  const chatR = chat.getBoundingClientRect();

  function scrollParent(el) {
    let node = el?.parentElement || null;
    while (node && node !== document.body) {
      const s = getComputedStyle(node);
      const oy = s.overflowY;
      if (
        (oy === "auto" || oy === "scroll" || oy === "overlay") &&
        node.scrollHeight > node.clientHeight + 1
      ) {
        return node;
      }
      node = node.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  const sp = scrollParent(grid);
  const spCs = getComputedStyle(sp);
  const before = {
    scrollTop: sp.scrollTop,
    scrollHeight: sp.scrollHeight,
    clientHeight: sp.clientHeight,
    maxScroll: sp.scrollHeight - sp.clientHeight,
  };
  sp.scrollTop = sp.scrollHeight;
  const articles = Array.from(document.querySelectorAll("article")).filter((a) =>
    a.querySelector('a[href*="listing"]'),
  );
  const last = articles[articles.length - 1];
  const lastR = last.getBoundingClientRect();
  const gridCs = getComputedStyle(grid);

  // Probe mid after scrolling facts under chat inside this scroller
  const mid = articles[Math.floor(articles.length / 2)];
  mid.scrollIntoView({ block: "center" });
  const mr = mid.getBoundingClientRect();
  sp.scrollTop += mr.top + mr.height * 0.7 - (chatR.top + chatR.height / 2);
  const facts = Array.from(mid.querySelectorAll('a[href*="listing"]')).find((a) =>
    /\$/.test(a.textContent || ""),
  );
  const fr = facts?.getBoundingClientRect();
  const factsOverlap =
    !!fr &&
    !(
      fr.right <= chatR.left ||
      fr.left >= chatR.right ||
      fr.bottom <= chatR.top ||
      fr.top >= chatR.bottom
    );
  const prev = chat.style.pointerEvents;
  chat.style.pointerEvents = "none";
  const under = document.elementFromPoint(
    chatR.left + chatR.width / 2,
    chatR.top + chatR.height / 2,
  );
  chat.style.pointerEvents = prev;

  // After max scroll again for end clearance inside scroller
  sp.scrollTop = sp.scrollHeight;
  const lastAfter = last.getBoundingClientRect();

  return {
    viewport: { w: innerWidth, h: innerHeight },
    scrollParent: {
      tag: sp.tagName,
      id: sp.id || null,
      className: (sp.className || "").toString().slice(0, 120),
      overflowY: spCs.overflowY,
      before,
      afterMaxScrollTop: sp.scrollTop,
      maxScroll: sp.scrollHeight - sp.clientHeight,
    },
    gridPaddingBottom: gridCs.paddingBottom,
    endClearance: {
      lastBottom: +lastAfter.bottom.toFixed(1),
      chatTop: +chatR.top.toFixed(1),
      clearsAboveChat: lastAfter.bottom <= chatR.top - 2,
      gap: +(chatR.top - lastAfter.bottom).toFixed(1),
    },
    midFacts: {
      factsOverlap,
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
