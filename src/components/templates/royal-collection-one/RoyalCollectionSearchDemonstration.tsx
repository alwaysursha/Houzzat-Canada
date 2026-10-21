"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import { ROYAL_COLLECTION_PREVIEW_ACTION_NOTE } from "./preview-action-note";
import styles from "./royal-search.module.css";

/**
 * Development-only search demonstration.
 * No search engine, map library, listing API, or lead action is mounted.
 */
const CONCEPT_PLACES = [
  "Niagara Falls",
  "Niagara-on-the-Lake",
  "St. Catharines",
  "Port Dalhousie",
] as const;

const VIEWS = [
  ["cards", "Cards"],
  ["map", "Map"],
  ["split", "Split"],
] as const;

type DemoView = (typeof VIEWS)[number][0];

/** Split is not offered below 1024px, matching the operational search. */
const NARROW_SEARCH = "(max-width: 1023px)";

export function RoyalCollectionSearchDemonstration() {
  const [view, setView] = useState<DemoView>("split");
  const [narrow, setNarrow] = useState(false);
  const visibleViews = narrow ? VIEWS.filter(([id]) => id !== "split") : VIEWS;

  useEffect(() => {
    const media = window.matchMedia(NARROW_SEARCH);
    const sync = () => {
      const matches = media.matches;
      setNarrow(matches);
      if (matches) {
        setView((current) => (current === "split" ? "cards" : current));
      }
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  function onViewKey(event: KeyboardEvent<HTMLDivElement>) {
    const index = visibleViews.findIndex(([id]) => id === view);
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next =
      event.key === "ArrowRight"
        ? visibleViews[(index + 1) % visibleViews.length][0]
        : visibleViews[(index - 1 + visibleViews.length) % visibleViews.length][0];
    setView(next);
  }

  return (
    <div className={styles.page}>
      <div className={styles.scroll}>
        <div className={styles.inner}>
          <header className={styles.intro}>
            <div>
              <p className={styles.kicker}>Your next chapter</p>
              <h1>Find your place.</h1>
            </div>
            <p>
              A design preview of luxury search. These controls and cards are
              concepts, not a connected listing board.
            </p>
          </header>

          <div className={styles.toolbar}>
            <div className={styles.modes} aria-hidden="true">
              <button type="button" aria-pressed="true">
                For sale
              </button>
              <button type="button" aria-pressed="false">
                For lease
              </button>
            </div>
            <div className={styles.query}>
              <small>Location</small>
              <strong>Niagara Region</strong>
            </div>
            <div className={styles.tools}>
              <div
                className={styles.views}
                role="tablist"
                aria-label="Search view"
                data-rc-allow=""
                onKeyDown={onViewKey}
              >
                {VIEWS.map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    className={id === "split" ? styles.splitTab : undefined}
                    aria-selected={view === id}
                    hidden={id === "split" && narrow}
                    tabIndex={view === id ? 0 : -1}
                    onClick={() => setView(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button type="button" className={styles.ghost} aria-disabled="true">
                Filters
              </button>
              <button type="button" className={styles.sort} aria-disabled="true">
                Newest
              </button>
            </div>
          </div>

          <div className={styles.chips} aria-label="Concept filters">
            <span className={styles.chip}>Niagara Region</span>
            <span className={styles.chip}>All properties</span>
            <span className={styles.chip}>Any budget</span>
          </div>
          <p className={styles.note}>{ROYAL_COLLECTION_PREVIEW_ACTION_NOTE}</p>

          <div
            className={[
              styles.stage,
              view === "map" ? styles.stageMap : "",
              view === "split" ? styles.stageSplit : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {view === "map" ? null : (
              <aside className={styles.filters} aria-label="Concept filters">
                <h2>Refine</h2>
                <label>
                  <span>Location</span>
                  <strong>Niagara Region</strong>
                </label>
                <label>
                  <span>Property type</span>
                  <strong>All properties</strong>
                </label>
                <label>
                  <span>Price range</span>
                  <strong>Any budget</strong>
                </label>
                <label>
                  <span>Beds</span>
                  <strong>—</strong>
                </label>
                <label>
                  <span>Baths</span>
                  <strong>—</strong>
                </label>
              </aside>
            )}

            {view === "map" ? null : (
              <section className={styles.results} aria-labelledby="rc-search-demo-results">
                <div className={styles.resultsHead}>
                  <h2 id="rc-search-demo-results">Concept previews</h2>
                  <p>Not listings. No addresses, prices, or board identifiers.</p>
                </div>
                <div className={styles.grid}>
                  {CONCEPT_PLACES.map((place) => (
                    <article key={place} className={styles.card}>
                      <div className={styles.media}>
                        <span className={styles.badge}>Concept</span>
                      </div>
                      <div className={styles.body}>
                        <p className={styles.meta}>
                          <span>— Beds</span>
                          <span>— Baths</span>
                          <span>— Ft²</span>
                        </p>
                        <p className={styles.city}>{place}</p>
                        <p className={styles.price}>Concept</p>
                        <p className={styles.address}>Not an MLS listing</p>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {view === "cards" ? null : (
              <aside className={styles.map} aria-label="Concept map">
                <div className={styles.mapCanvas}>
                  <svg
                    className={styles.mapArt}
                    viewBox="0 0 640 520"
                    role="img"
                    aria-labelledby="rc-concept-map-title rc-concept-map-desc"
                  >
                    <title id="rc-concept-map-title">Concept map</title>
                    <desc id="rc-concept-map-desc">
                      An illustrative drawing of the Niagara shoreline. Not a
                      live property map. No listing pins.
                    </desc>
                    <rect width="640" height="520" fill="#071629" />
                    <path
                      d="M0 0H640V210C540 188 430 246 300 214C170 182 90 198 0 150Z"
                      fill="#0B1F3A"
                    />
                    <path
                      d="M0 36H640"
                      stroke="#C8A66A"
                      strokeOpacity="0.16"
                    />
                    <path
                      d="M0 84H640"
                      stroke="#C8A66A"
                      strokeOpacity="0.12"
                    />
                    <path
                      d="M0 132H640"
                      stroke="#C8A66A"
                      strokeOpacity="0.1"
                    />
                    <path
                      d="M0 176C110 154 170 214 270 198C390 178 470 236 640 214V520H0Z"
                      fill="#145A46"
                    />
                    <path
                      d="M0 248C140 214 210 286 330 262C450 238 520 292 640 268V520H0Z"
                      fill="#0B1F3A"
                    />
                    <path
                      d="M108 390C118 320 88 268 112 214C128 176 110 146 122 108"
                      fill="none"
                      stroke="#C8A66A"
                      strokeWidth="2.5"
                    />
                    <path
                      d="M150 360C270 332 390 372 560 334"
                      fill="none"
                      stroke="#C8A66A"
                      strokeOpacity="0.55"
                    />
                  </svg>
                  <ul className={styles.mapPlaces}>
                    <li className={styles.placeFalls}>Niagara Falls</li>
                    <li className={styles.placeLake}>Niagara-on-the-Lake</li>
                    <li className={styles.placeCatharines}>St. Catharines</li>
                    <li className={styles.placeDalhousie}>Port Dalhousie</li>
                  </ul>
                </div>
                <div className={styles.mapCaption}>
                  <p>Concept map</p>
                  <strong>Not a live property map.</strong>
                  <span>
                    Illustrative shoreline only. This panel does not load a
                    map or property pins.
                  </span>
                </div>
              </aside>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
