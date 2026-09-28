import Image from "next/image";
import Link from "next/link";
import { FaqExplorer } from "@/components/platform/public/site/FaqExplorer";
import type { PublicStory, StoryKind, StoryShot } from "@/components/platform/public/site/public-stories";

function Shot({ shot }: { shot: StoryShot }) {
  return (
    <figure className="hp-pub-shot">
      <Image src={shot.src} alt={shot.alt} width={shot.width} height={shot.height} unoptimized />
    </figure>
  );
}

function Actions() {
  return (
    <div className="hp-pub-actions">
      <Link href="/book-a-demo" className="hp-pub-primary">
        Book a Demo
      </Link>
      <Link href="/pricing" className="hp-pub-secondary">
        Pricing
      </Link>
    </div>
  );
}

function Note({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <aside className="hp-pub-note">
      <p>{text}</p>
    </aside>
  );
}

function Points({ story }: { story: PublicStory }) {
  if (!story.points?.length) return null;
  return (
    <div className="hp-pub-grid">
      {story.points.map((point) => (
        <article key={point.title} className="hp-pub-card">
          <h3>{point.title}</h3>
          <p>{point.body}</p>
        </article>
      ))}
    </div>
  );
}

function Steps({ story }: { story: PublicStory }) {
  if (!story.steps?.length) return null;
  return (
    <ol className="hp-pub-flow">
      {story.steps.map((step, index) => (
        <li key={step.title} className="hp-pub-step">
          <span className="hp-pub-index">{index + 1}</span>
          <div>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Links({ story }: { story: PublicStory }) {
  if (!story.links?.length) return null;
  return (
    <div className="hp-pub-grid">
      {story.links.map((link) => (
        <Link key={`${link.href}-${link.title}`} href={link.href} className="hp-pub-path">
          <h3>{link.title}</h3>
          <p>{link.body}</p>
          <p className="hp-pub-link">Open</p>
        </Link>
      ))}
    </div>
  );
}

function EmptyHub({ story }: { story: PublicStory }) {
  return (
    <div className="hp-pub-empty">
      <h2>Nothing is published here yet</h2>
      <p>
        {story.lead} Book a demo if you want to see the product itself.
      </p>
      <div className="hp-pub-actions">
        <Link href="/book-a-demo" className="hp-pub-primary">
          Book a Demo
        </Link>
      </div>
    </div>
  );
}

export function PublicStoryView({ story }: { story: PublicStory }) {
  const kind: StoryKind = story.kind;
  const primary = story.shots?.[0];

  switch (kind) {
    case "overview":
      return (
        <>
          <header className="hp-pub-hero hp-pub-split">
            <div>
              <p className="hp-pub-kicker">{story.kicker}</p>
              <h1>{story.headline}</h1>
              <p className="hp-pub-lead">{story.lead}</p>
              <Actions />
            </div>
            {primary ? <Shot shot={primary} /> : null}
          </header>
          <section className="hp-pub-band">
            <h2>The client journey</h2>
            <Steps story={story} />
          </section>
          <section className="hp-pub-band">
            <h2>Go further</h2>
            <Links story={story} />
          </section>
        </>
      );
    case "split":
      return (
        <>
          <header className="hp-pub-hero hp-pub-split">
            <div>
              <p className="hp-pub-kicker">{story.kicker}</p>
              <h1>{story.headline}</h1>
              <p className="hp-pub-lead">{story.lead}</p>
              <Actions />
            </div>
            {primary ? <Shot shot={primary} /> : null}
          </header>
          {story.shots && story.shots.length > 1 ? (
            <section className="hp-pub-band hp-pub-split">
              {story.shots.slice(1).map((shot) => (
                <Shot key={shot.src} shot={shot} />
              ))}
            </section>
          ) : null}
          <section className="hp-pub-band">
            <Points story={story} />
            <Steps story={story} />
            <Note text={story.note} />
          </section>
        </>
      );
    case "flow":
      return (
        <>
          <header className="hp-pub-hero">
            <p className="hp-pub-kicker">{story.kicker}</p>
            <h1>{story.headline}</h1>
            <p className="hp-pub-lead">{story.lead}</p>
            <Actions />
          </header>
          <section className="hp-pub-band">
            <Steps story={story} />
            {primary ? <Shot shot={primary} /> : null}
            <Note text={story.note} />
          </section>
        </>
      );
    case "phones":
      return (
        <>
          <header className="hp-pub-hero">
            <p className="hp-pub-kicker">{story.kicker}</p>
            <h1>{story.headline}</h1>
            <p className="hp-pub-lead">{story.lead}</p>
            <Actions />
          </header>
          <section className="hp-pub-band">
            <div className="hp-pub-phones">
              {story.shots?.map((shot) => (
                <div key={shot.src} className="hp-pub-phone">
                  <Image src={shot.src} alt={shot.alt} width={shot.width} height={shot.height} unoptimized />
                </div>
              ))}
            </div>
            <Points story={story} />
          </section>
        </>
      );
    case "audience":
      return (
        <>
          <header className="hp-pub-hero hp-pub-split">
            <div>
              <p className="hp-pub-kicker">{story.kicker}</p>
              <h1>{story.headline}</h1>
              <p className="hp-pub-lead">{story.lead}</p>
              <Actions />
            </div>
            {primary ? <Shot shot={primary} /> : null}
          </header>
          <section className="hp-pub-band">
            <Steps story={story} />
            <Points story={story} />
            <Note text={story.note} />
          </section>
        </>
      );
    case "goal":
      return (
        <>
          <header className="hp-pub-hero">
            <p className="hp-pub-kicker">{story.kicker}</p>
            <h1>{story.headline}</h1>
            <p className="hp-pub-lead">{story.lead}</p>
          </header>
          <section className="hp-pub-band">
            <Links story={story} />
            {story.shots ? (
              <div className="hp-pub-phones">
                {story.shots.map((shot) => (
                  <div key={shot.src} className="hp-pub-phone">
                    <Image src={shot.src} alt={shot.alt} width={shot.width} height={shot.height} unoptimized />
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        </>
      );
    case "pricing":
      return (
        <>
          <header className="hp-pub-hero">
            <p className="hp-pub-kicker">{story.kicker}</p>
            <h1>{story.headline}</h1>
            <p className="hp-pub-lead">{story.lead}</p>
            <div className="hp-pub-actions">
              <Link href="/book-a-demo" className="hp-pub-primary">
                Book a Demo
              </Link>
            </div>
          </header>
          <section className="hp-pub-band">
            <h2>What the proposal reflects</h2>
            <Points story={story} />
            <Note text={story.note} />
          </section>
          <section className="hp-pub-band">
            <h2>What happens next</h2>
            <ol className="hp-pub-flow">
              <li className="hp-pub-step"><span className="hp-pub-index">1</span><div><h3>Book a demo</h3><p>See the website, CRM, properties, viewings, and mobile app.</p></div></li>
              <li className="hp-pub-step"><span className="hp-pub-index">2</span><div><h3>We learn the operation</h3><p>Setup, seats, and the capabilities you need.</p></div></li>
              <li className="hp-pub-step"><span className="hp-pub-index">3</span><div><h3>Private proposal</h3><p>Commercial terms are delivered after the demo, not on this page.</p></div></li>
            </ol>
          </section>
          {story.groups ? <FaqExplorer groups={story.groups} /> : null}
        </>
      );
    case "hub":
      return (
        <>
          <header className="hp-pub-hero">
            <p className="hp-pub-kicker">{story.kicker}</p>
            <h1>{story.headline}</h1>
            <p className="hp-pub-lead">{story.lead}</p>
          </header>
          <section className="hp-pub-band">
            <EmptyHub story={story} />
            <div className="hp-pub-hub">
              <Points story={story} />
            </div>
          </section>
        </>
      );
    case "faq":
      return (
        <>
          <header className="hp-pub-hero">
            <p className="hp-pub-kicker">{story.kicker}</p>
            <h1>{story.headline}</h1>
            <p className="hp-pub-lead">{story.lead}</p>
          </header>
          {story.groups ? <FaqExplorer groups={story.groups} /> : null}
        </>
      );
    case "contact":
      return (
        <>
          <header className="hp-pub-hero">
            <p className="hp-pub-kicker">{story.kicker}</p>
            <h1>{story.headline}</h1>
            <p className="hp-pub-lead">{story.lead}</p>
          </header>
          <section className="hp-pub-band">
            <Links story={story} />
            <aside className="hp-pub-note">
              <p>
                Existing customers can email <a className="hp-pub-link" href="mailto:support@houzzatpro.com">support@houzzatpro.com</a>. Replies are typically within one business day.
              </p>
            </aside>
          </section>
        </>
      );
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}
