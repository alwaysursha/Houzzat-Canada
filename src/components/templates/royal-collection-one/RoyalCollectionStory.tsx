import type { RoyalCollectionView } from "@/lib/tenancy/templates/resolve-royal-collection-view";
import { RoyalCollectionReveal } from "./RoyalCollectionReveal";
import styles from "./royal-collection.module.css";

export function RoyalCollectionStory({ view }: { view: RoyalCollectionView }) {
  const vines = view.scenes.find((scene) => scene.id === "niagara-on-the-lake")?.conceptStill;
  const falls = view.scenes.find((scene) => scene.id === "niagara-falls")?.conceptStill;
  const niagara = Boolean(view.displayFixtureId);

  return (
    <section className={`${styles.section} ${styles.story}`} aria-labelledby="rc-story-heading">
      <RoyalCollectionReveal className={styles.storyCollage}>
        <div
          className={styles.storyMain}
          style={vines ? { backgroundImage: `linear-gradient(rgb(7 22 41 / 0.09), rgb(7 22 41 / 0.25)), url(${vines})` } : undefined}
        />
        <div
          className={styles.storyInset}
          style={falls ? { backgroundImage: `url(${falls})` } : undefined}
        />
        <div className={styles.storyStamp}>
          {niagara ? "THE NIAGARA EDIT / VOL. 01" : "THE EDIT / VOL. 01"}
        </div>
      </RoyalCollectionReveal>
      <RoyalCollectionReveal className={styles.storyCopy}>
        <div className={styles.sectionMeta}>A different perspective</div>
        <h2 id="rc-story-heading">
          Where place
          <br />
          becomes <em>passion.</em>
        </h2>
        <p>
          {niagara
            ? "From the energy of Niagara Falls to the quiet beauty of wine country, this is a region that lives beyond expectations."
            : "A more considered way to look at home, built around the places and the people who choose them."}
        </p>
        <p>
          {view.brandName} is built around a simple idea: your real estate journey should feel as
          distinctive as the place you choose to call home.
        </p>
        <div className={styles.storyDots}>
          <div>
            <b>Discover</b>
            Thoughtful search
          </div>
          <span />
          <div>
            <b>Connect</b>
            Personal guidance
          </div>
        </div>
        <a className={styles.textLink} href="#rc-communities" data-rc-allow="">
          Explore the region <span>↗</span>
        </a>
      </RoyalCollectionReveal>
    </section>
  );
}
