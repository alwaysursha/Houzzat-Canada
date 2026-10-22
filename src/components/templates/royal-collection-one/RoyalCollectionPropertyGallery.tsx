"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import styles from "./royal-property.module.css";

export type RoyalConceptFrame = {
  src: string;
  label: string;
  alt: string;
};

type FrameStudy = "series" | "single" | "none";

const STUDIES: { id: FrameStudy; label: string }[] = [
  { id: "series", label: "Series" },
  { id: "single", label: "Single" },
  { id: "none", label: "None" },
];

/**
 * Concept gallery for the development property preview.
 * Frames are local design studies. This component does not load a listing.
 */
export function RoyalCollectionPropertyGallery({
  frames,
  presentation = "concept",
}: {
  frames: readonly RoyalConceptFrame[];
  presentation?: "concept" | "listing";
}) {
  const [study, setStudy] = useState<FrameStudy>(frames.length > 1 ? "series" : frames.length === 1 ? "single" : "none");
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const dialogRef = useRef<HTMLDialogElement>(null);
  const originX = useRef<number | null>(null);

  const listing = presentation === "listing";
  const visible = listing
    ? frames
    : study === "none"
      ? []
      : study === "single"
        ? frames.slice(0, 1)
        : frames;
  const count = visible.length;
  const current = count > 0 ? visible[Math.min(index, count - 1)] : null;
  const showChrome = count > 1;
  const missing = !current || (current ? broken[current.src] : false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const nav = document.querySelector('nav[aria-label="Mobile"]');
    if (!(nav instanceof HTMLElement)) return;
    const previous = nav.style.visibility;
    nav.style.visibility = "hidden";
    return () => {
      nav.style.visibility = previous;
    };
  }, [open]);

  function step(direction: -1 | 1) {
    if (count < 2) return;
    setIndex((value) => (value + direction + count) % count);
  }

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const target = event.target;
    if (target instanceof Element && target.closest("button")) {
      originX.current = null;
      return;
    }
    originX.current = event.clientX;
  }

  function onPointerUp(event: PointerEvent<HTMLElement>) {
    if (originX.current == null) return;
    const delta = event.clientX - originX.current;
    originX.current = null;
    if (delta > 48) step(-1);
    else if (delta < -48) step(1);
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      step(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      step(1);
    } else if (event.key === "Enter" && current && !missing) {
      event.preventDefault();
      setOpen(true);
    }
  }

  const stage = (
    <div
      className={styles.stageFrame}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        originX.current = null;
      }}
    >
        {current && !broken[current.src] ? (
        // Local design stills. The image optimizer can return an undecodable body for these files.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={current.src}
          src={current.src}
          alt={current.alt}
          className={styles.stagePhoto}
          draggable={false}
          onError={() => {
            const src = current.src;
            setBroken((state) => ({ ...state, [src]: true }));
          }}
        />
        ) : (
        <ArchitecturalStudy
          caption={
            current
              ? listing
                ? "This photograph could not be shown."
                : "This study could not be shown."
              : listing
                ? "No photograph is on file."
                : "No photograph is part of this concept."
          }
        />
      )}
      {listing ? null : (
        <p className={styles.stageKicker}>Concept study — not a listing photograph</p>
      )}
    </div>
  );

  return (
    <section
      className={styles.gallery}
      aria-label={listing ? "Property gallery" : "Concept gallery"}
      data-rc-allow=""
    >
      <div className={styles.galleryBar}>
        <p>{listing ? "Photographs" : "Concept gallery"}</p>
        {!listing && frames.length > 1 ? (
          <div className={styles.studySwitch} role="group" aria-label="Frame study">
            {STUDIES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={study === item.id ? styles.studyOn : styles.studyOff}
                aria-pressed={study === item.id}
                onClick={() => {
                  setStudy(item.id);
                  setIndex(0);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div
        className={styles.stageWrap}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        aria-roledescription="carousel"
        aria-label={listing ? "Listing photographs" : "Concept studies"}
      >
        {stage}
        {showChrome ? (
          <div className={styles.stageNav}>
            <button
              type="button"
              className={styles.navButton}
              onClick={() => step(-1)}
              aria-label={listing ? "Previous photograph" : "Previous concept study"}
            >
              Prev
            </button>
            <p aria-live="polite">
              {Math.min(index, count - 1) + 1} / {count}
            </p>
            <button
              type="button"
              className={styles.navButton}
              onClick={() => step(1)}
              aria-label={listing ? "Next photograph" : "Next concept study"}
            >
              Next
            </button>
          </div>
        ) : (
          <p className={styles.stageNote}>
            {count === 0
              ? listing
                ? "No photograph is on file."
                : "Missing-photo presentation. Nothing is loaded in its place."
              : listing
                ? "One photograph is on file."
                : "One-photo presentation. No further studies are available."}
          </p>
        )}
        {current && !missing ? (
          <button type="button" className={styles.expand} onClick={() => setOpen(true)}>
            View fullscreen
          </button>
        ) : null}
      </div>

      {showChrome ? (
        <ul className={styles.thumbs}>
          {visible.map((frame, frameIndex) => (
            <li key={frame.src}>
              <button
                type="button"
                className={frameIndex === index ? styles.thumbOn : styles.thumb}
                aria-label={frame.label}
                aria-current={frameIndex === index ? "true" : undefined}
                onClick={() => setIndex(frameIndex)}
              >
                {broken[frame.src] ? (
                  <span className={styles.thumbEmpty} />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={frame.src} alt="" />
                )}
                <span>{frame.label}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <dialog
        ref={dialogRef}
        className={styles.lightbox}
        aria-label={listing ? "Fullscreen photograph" : "Fullscreen concept study"}
        onClose={() => setOpen(false)}
        onKeyDown={onKeyDown}
      >
        <div className={styles.lightboxBar}>
          <p>{current?.label ?? (listing ? "Photograph" : "Concept study")}</p>
          <button type="button" className={styles.navButton} onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
        <div
          className={styles.lightboxStage}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
        >
          {current && !missing ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={current.src} alt={current.alt} />
          ) : (
            <ArchitecturalStudy
              caption={listing ? "No photograph is on file." : "No photograph is part of this concept."}
            />
          )}
        </div>
        {showChrome ? (
          <div className={styles.stageNav}>
            <button
              type="button"
              className={styles.navButton}
              onClick={() => step(-1)}
              aria-label={listing ? "Previous photograph" : "Previous concept study"}
            >
              Prev
            </button>
            <p aria-live="polite">
              {Math.min(index, count - 1) + 1} / {count}
            </p>
            <button
              type="button"
              className={styles.navButton}
              onClick={() => step(1)}
              aria-label={listing ? "Next photograph" : "Next concept study"}
            >
              Next
            </button>
          </div>
        ) : null}
      </dialog>
    </section>
  );
}

function ArchitecturalStudy({ caption }: { caption: string }) {
  return (
    <div className={styles.studyArt} role="img" aria-label={caption}>
      <div className={styles.mass} />
      <div className={styles.wing} />
      <div className={styles.court} />
      <div className={styles.opening} />
      <div className={styles.horizon} />
      <p>{caption}</p>
    </div>
  );
}
