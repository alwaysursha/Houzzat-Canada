"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  royalListingGalleryLayout,
  type RoyalListingGalleryLayout,
} from "@/lib/tenancy/templates/royal-collection-gallery-layout";
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
      const target = event.target;
      if (target instanceof Element && target.closest("button")) return;
      event.preventDefault();
      setOpen(true);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  if (listing) {
    const activeIndex = count > 0 ? Math.min(index, count - 1) : 0;
    return (
      <section className={styles.gallery} aria-label="Property gallery" data-rc-allow="">
        <div className={styles.galleryBar}>
          <p>Photographs</p>
          <p>{count === 1 ? "1 photo" : `${count} photos`}</p>
        </div>
        <ListingMosaic
          frames={visible}
          broken={broken}
          index={activeIndex}
          onOpen={(frameIndex) => {
            setIndex(frameIndex);
            setOpen(true);
          }}
          onStep={step}
          onBroken={(src) => {
            setBroken((state) => ({ ...state, [src]: true }));
          }}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            originX.current = null;
          }}
          onKeyDown={onKeyDown}
        />
        <dialog
          ref={dialogRef}
          className={styles.lightbox}
          aria-label="Fullscreen photograph"
          onClose={() => setOpen(false)}
          onKeyDown={onKeyDown}
        >
          <div className={styles.lightboxBar}>
            <p>{current?.label ?? "Photograph"}</p>
            <button type="button" className={styles.navButton} onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
          <div className={styles.lightboxStage} onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
            {current && !missing ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={current.src} alt={current.alt} />
            ) : (
              <ArchitecturalStudy caption="No photograph is on file." />
            )}
          </div>
          {showChrome ? (
            <div className={styles.stageNav}>
              <button
                type="button"
                className={styles.navButton}
                onClick={() => step(-1)}
                aria-label="Previous photograph"
              >
                Previous
              </button>
              <p aria-live="polite">
                {activeIndex + 1} / {count}
              </p>
              <button
                type="button"
                className={styles.navButton}
                onClick={() => step(1)}
                aria-label="Next photograph"
              >
                Next
              </button>
            </div>
          ) : null}
        </dialog>
      </section>
    );
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

function ListingMosaic({
  frames,
  broken,
  index,
  onOpen,
  onStep,
  onBroken,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onKeyDown,
}: {
  frames: readonly RoyalConceptFrame[];
  broken: Record<string, boolean>;
  index: number;
  onOpen: (frameIndex: number) => void;
  onStep: (direction: -1 | 1) => void;
  onBroken: (src: string) => void;
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  onPointerCancel: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}) {
  const count = frames.length;
  const layout = royalListingGalleryLayout(count);
  const active = frames[index] ?? null;

  return (
    <div className={styles.galleryFrame}>
      <ListingMosaicGrid
        layout={layout}
        frames={frames}
        broken={broken}
        onOpen={onOpen}
        onBroken={onBroken}
      />
      <div
        className={styles.mobileReel}
        tabIndex={0}
        aria-roledescription="carousel"
        aria-label="Listing photographs"
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {active && !broken[active.src] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={active.src} alt={active.alt} draggable={false} onError={() => onBroken(active.src)} />
        ) : (
          <ArchitecturalStudy
            caption={active ? "This photograph could not be shown." : "No photograph is on file."}
          />
        )}
        {count > 0 ? (
          <p className={styles.reelCount} aria-live="polite">
            {index + 1} / {count}
          </p>
        ) : null}
        {count > 1 ? (
          <>
            <button type="button" className={styles.reelPrev} aria-label="Previous photograph" onClick={() => onStep(-1)}>
              <span aria-hidden="true">‹</span>
            </button>
            <button type="button" className={styles.reelNext} aria-label="Next photograph" onClick={() => onStep(1)}>
              <span aria-hidden="true">›</span>
            </button>
          </>
        ) : null}
      </div>
      {count > 0 ? (
        <button type="button" className={styles.viewAll} onClick={() => onOpen(index)}>
          View All Photos
          <span>{count}</span>
        </button>
      ) : null}
    </div>
  );
}

function ListingMosaicGrid({
  layout,
  frames,
  broken,
  onOpen,
  onBroken,
}: {
  layout: RoyalListingGalleryLayout;
  frames: readonly RoyalConceptFrame[];
  broken: Record<string, boolean>;
  onOpen: (frameIndex: number) => void;
  onBroken: (src: string) => void;
}) {
  const count = frames.length;
  const tile = (frameIndex: number) => {
    const frame = frames[frameIndex];
    if (!frame) return null;
    return (
      <GalleryTile
        key={`${frame.src}-${frameIndex}`}
        frame={frame}
        position={frameIndex + 1}
        total={count}
        broken={Boolean(broken[frame.src])}
        onOpen={() => onOpen(frameIndex)}
        onBroken={() => onBroken(frame.src)}
      />
    );
  };

  switch (layout) {
    case "none":
      return (
        <div className={styles.mosaicOne} data-gallery-layout="none" data-photo-count="0">
          <ArchitecturalStudy caption="No photograph is on file." />
        </div>
      );
    case "one":
      return (
        <div className={styles.mosaicOne} data-gallery-layout="one" data-photo-count={count}>
          {tile(0)}
        </div>
      );
    case "two":
      return (
        <div className={styles.mosaicTwo} data-gallery-layout="two" data-photo-count={count}>
          {tile(0)}
          {tile(1)}
        </div>
      );
    case "three":
      return (
        <div className={styles.mosaicThree} data-gallery-layout="three" data-photo-count={count}>
          {tile(0)}
          <div className={styles.mosaicStack}>
            {tile(1)}
            {tile(2)}
          </div>
        </div>
      );
    case "four":
      return (
        <div className={styles.mosaicFour} data-gallery-layout="four" data-photo-count={count}>
          {tile(0)}
          {tile(1)}
          {tile(2)}
          {tile(3)}
        </div>
      );
    case "five":
      return (
        <div className={styles.mosaicFive} data-gallery-layout="five" data-photo-count={count}>
          {tile(0)}
          <div className={styles.mosaicQuad}>
            {tile(1)}
            {tile(2)}
            {tile(3)}
            {tile(4)}
          </div>
        </div>
      );
    default: {
      const unexpected: never = layout;
      return unexpected;
    }
  }
}

function GalleryTile({
  frame,
  position,
  total,
  broken,
  onOpen,
  onBroken,
}: {
  frame: RoyalConceptFrame;
  position: number;
  total: number;
  broken: boolean;
  onOpen: () => void;
  onBroken: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.tile}
      aria-label={`Open photograph ${position} of ${total}. ${frame.alt}`}
      onClick={onOpen}
    >
      {broken ? (
        <span className={styles.tileEmpty}>Photograph unavailable</span>
      ) : (
        // Local design stills and listing SVG illustrations. The image optimizer can return an undecodable body.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={frame.src} alt={frame.alt} draggable={false} onError={onBroken} />
      )}
    </button>
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
