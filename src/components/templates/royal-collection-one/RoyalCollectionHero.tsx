"use client";

import { useEffect, useRef, useState } from "react";
import type { RoyalCollectionScene } from "@/lib/tenancy/templates/royal-collection-media";
import type { RoyalCollectionView } from "@/lib/tenancy/templates/resolve-royal-collection-view";
import { ROYAL_COLLECTION_PREVIEW_ACTION_NOTE } from "./preview-action-note";
import { RoyalCollectionPreviewLink } from "./RoyalCollectionPreviewLink";
import styles from "./royal-collection.module.css";

const SCENE_MS = 8500;

const TAB_LABELS: Record<string, string> = {
  "niagara-falls": "The Falls",
  "niagara-on-the-lake": "Wine Country",
  "niagara-waterfront": "Waterfront",
};

export function RoyalCollectionHero({ view }: { view: RoyalCollectionView }) {
  const scenes = view.scenes.length
    ? view.scenes
    : [
        {
          id: "signature",
          title: "Signature",
          caption: "",
          src: "",
          poster: view.posterUrl,
          conceptStill: view.posterUrl,
        },
      ];
  const [index, setIndex] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduceMotion(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (reduceMotion || scenes.length < 2) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % scenes.length);
    }, SCENE_MS);
    return () => window.clearInterval(timer);
  }, [reduceMotion, scenes.length]);

  const kicker = [view.agentName, view.markets[0]].filter(Boolean).join(" · ");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function selectScene(next: number) {
    const count = scenes.length;
    const wrapped = (next + count) % count;
    setIndex(wrapped);
    tabRefs.current[wrapped]?.focus();
  }

  return (
    <section className={styles.hero} aria-label="Discover Niagara luxury living">
      <div className={styles.heroWash} aria-hidden="true" />
      {scenes.map((scene, sceneIndex) => (
        <div
          key={scene.id}
          className={[styles.heroScene, sceneIndex === index ? styles.heroSceneOn : ""]
            .filter(Boolean)
            .join(" ")}
          style={
            scene.conceptStill ? { backgroundImage: `url(${scene.conceptStill})` } : undefined
          }
          aria-hidden="true"
        />
      ))}
      {scenes.map((scene, sceneIndex) =>
        scene.src.trim() && !reduceMotion ? (
          <HeroSceneVideo
            key={`${scene.id}-video`}
            scene={scene}
            active={sceneIndex === index}
          />
        ) : null,
      )}
      <div className={styles.heroOverlay} />
      <div className={styles.heroFine} aria-hidden="true" />
      <div className={styles.heroContent}>
        <div className={styles.heroKicker}>
          <span className={styles.goldLine} />
          {kicker || view.brandName}
        </div>
        <h1 className={styles.heroTitle}>
          Live
          <br />
          <em>Extraordinary.</em>
        </h1>
        <p className={styles.heroDesc}>
          {view.tagline ||
            "More than a home. A sense of place. Discover real estate through a more considered, more personal lens."}
        </p>
        <div className={styles.heroActions}>
          <RoyalCollectionPreviewLink
            className={`${styles.button} ${styles.buttonGold}`}
            href="/search"
            disabled={view.actionsDisabled}
          >
            Explore Homes <span>↗</span>
          </RoyalCollectionPreviewLink>
          <RoyalCollectionPreviewLink
            className={`${styles.button} ${styles.buttonOutline}`}
            href="/home-valuation"
            disabled={view.actionsDisabled}
          >
            Discover Your Home&apos;s Value <span>↗</span>
          </RoyalCollectionPreviewLink>
        </div>
        {view.actionsDisabled ? (
          <p className={styles.previewNote}>{ROYAL_COLLECTION_PREVIEW_ACTION_NOTE}</p>
        ) : null}
      </div>
      <div className={styles.heroVertical}>
        {view.displayFixtureId ? "THE ART OF LIVING · NIAGARA" : "THE ART OF LIVING"}
      </div>
      <div className={styles.heroBottom}>
        <div className={styles.heroScenes} role="tablist" aria-label="Hero scenes">
          {scenes.map((scene, sceneIndex) => (
            <button
              key={scene.id}
              ref={(node) => {
                tabRefs.current[sceneIndex] = node;
              }}
              type="button"
              className={[styles.heroSceneBtn, sceneIndex === index ? styles.heroSceneBtnOn : ""]
                .filter(Boolean)
                .join(" ")}
              data-rc-allow=""
              role="tab"
              id={`rc-hero-tab-${scene.id}`}
              aria-selected={sceneIndex === index}
              tabIndex={sceneIndex === index ? 0 : -1}
              onClick={() => setIndex(sceneIndex)}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight") {
                  event.preventDefault();
                  selectScene(sceneIndex + 1);
                } else if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  selectScene(sceneIndex - 1);
                } else if (event.key === "Home") {
                  event.preventDefault();
                  selectScene(0);
                } else if (event.key === "End") {
                  event.preventDefault();
                  selectScene(scenes.length - 1);
                }
              }}
            >
              {sceneIndex === index && !reduceMotion && scenes.length > 1 ? (
                <span className={styles.heroProgress} style={{ animationDuration: `${SCENE_MS}ms` }} />
              ) : null}
              <b>{String(sceneIndex + 1).padStart(2, "0")}</b>
              {TAB_LABELS[scene.id] || scene.title}
            </button>
          ))}
        </div>
        <a className={styles.heroScroll} href="#rc-search" data-rc-allow="">
          Scroll to discover
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M10 2v16M4 12l6 6 6-6" stroke="currentColor" fill="none" />
          </svg>
        </a>
      </div>
    </section>
  );
}

function HeroSceneVideo({
  scene,
  active,
}: {
  scene: RoyalCollectionScene;
  active: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const show = () => video.classList.add(styles.heroVideoOn);
    const hide = () => {
      video.pause();
      video.classList.remove(styles.heroVideoOn);
    };
    if (!active) {
      hide();
      return;
    }
    const play = () => {
      show();
      void video.play().catch(() => {});
    };
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) play();
    else video.addEventListener("canplay", play, { once: true });
    const onVisibility = () => {
      if (document.hidden) video.pause();
      else void video.play().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      video.removeEventListener("canplay", play);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active]);

  return (
    <video
      ref={videoRef}
      className={styles.heroVideo}
      poster={scene.poster ?? undefined}
      muted
      playsInline
      loop
      preload={active ? "metadata" : "none"}
      aria-hidden="true"
    >
      {active ? <source src={scene.src} /> : null}
    </video>
  );
}
