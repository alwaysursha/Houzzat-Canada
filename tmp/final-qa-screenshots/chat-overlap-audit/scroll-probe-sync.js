(() => {
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top:+r.top.toFixed(1), left:+r.left.toFixed(1), right:+r.right.toFixed(1), bottom:+r.bottom.toFixed(1), w:+r.width.toFixed(1), h:+r.height.toFixed(1) };
  };
  const intersects = (a,b) => !!(a&&b) && !(a.right<=b.left || a.left>=b.right || a.bottom<=b.top || a.top>=b.bottom);
  const chat = document.querySelector("[data-customer-chat-entry]");
  const chatR = rect(chat);
  const articles = Array.from(document.querySelectorAll("article")).filter(a => a.querySelector('a[href*="listing"]'));
  const probe = (article, label) => {
    const save = article.querySelector('button[aria-label*="Save" i], button[aria-label*="saved" i]');
    const factsLink = Array.from(article.querySelectorAll('a[href*="listing"]')).find(a => a.querySelector("p") || /\$/.test(a.textContent||""));
    const photoLink = article.querySelector(".search-result-photo a[href*='listing']");
    const saveR = rect(save);
    const factsR = rect(factsLink);
    const photoR = rect(photoLink);
    const cardR = rect(article);
    // save hit test
    let saveReachable = null;
    if (saveR) {
      const el = document.elementFromPoint(saveR.left + saveR.w/2, saveR.top + saveR.h/2);
      saveReachable = !!(el && (save===el || save.contains(el)));
    }
    // left-side listing open (photo or facts left)
    let leftListingOk = null;
    const leftTarget = photoR || factsR;
    if (leftTarget) {
      const x = Math.min(leftTarget.left + 48, chatR.left - 12);
      const y = Math.min(Math.max(leftTarget.top + 40, 8), innerHeight - 8);
      const el = document.elementFromPoint(x,y);
      leftListingOk = { ok: !!(el && el.closest('a[href*="listing"]')), x, y };
    }
    // under fab (chat pe off)
    const prev = chat.style.pointerEvents;
    chat.style.pointerEvents = "none";
    const under = document.elementFromPoint(chatR.left + chatR.w/2, chatR.top + chatR.h/2);
    chat.style.pointerEvents = prev;
    return {
      label,
      href: (factsLink||photoLink)?.getAttribute("href"),
      overlaps: {
        card: intersects(cardR, chatR),
        save: intersects(saveR, chatR),
        factsLink: intersects(factsR, chatR),
        photoLink: intersects(photoR, chatR),
      },
      saveReachable,
      leftListingOk,
      underFab: under ? {
        tag: under.tagName,
        href: under.closest("a")?.getAttribute("href")||null,
        isSave: !!(under.closest("button[aria-label*='Save' i]")),
        isListingLink: !!(under.closest("a[href*='listing']")),
        text: (under.textContent||"").replace(/\s+/g," ").trim().slice(0,60)
      } : null,
      saveInViewport: !!(saveR && saveR.bottom > 0 && saveR.top < innerHeight),
    };
  };

  const align = (article) => {
    const r = article.getBoundingClientRect();
    const targetTop = chatR.top + chatR.h/2 - r.height * 0.7;
    window.scrollBy(0, r.top - targetTop);
  };

  const out = [];
  // first
  window.scrollTo(0,0);
  align(articles[0]);
  out.push(probe(articles[0], "first"));
  // middle
  const mid = articles[Math.floor((articles.length-1)/2)];
  mid.scrollIntoView({block:"center"});
  align(mid);
  out.push(probe(mid, "middle"));
  // last
  const last = articles[articles.length-1];
  last.scrollIntoView({block:"end"});
  // end clearance check first
  const lastR = rect(last);
  const endClear = {
    lastBottom: lastR.bottom,
    chatTop: chatR.top,
    clearsAboveChat: lastR.bottom <= chatR.top - 2,
    gap: +(chatR.top - lastR.bottom).toFixed(1),
    gridPb: parseFloat(getComputedStyle(document.querySelector(".search-result-grid")).paddingBottom)
  };
  align(last);
  out.push(probe(last, "last"));

  return { viewport: {w:innerWidth,h:innerHeight}, chat: chatR, probes: out, endClear };
})()
