import { ModeArt } from './art'
import { MODES, type ModeId } from './data'

// The home page: the hero (the cover picture: public/cover.jpg, or on phones the upright
// public/cover_mobile.jpg), and under it (overlapping its foot) the two modes, as big cards that open
// each mode's page

export function Home({ onMode }: { onMode: (mode: ModeId) => void }) {
  return (
    <>
      <section className="hero">
        <picture>
          <source media="(max-width: 640px)" srcSet="/cover_mobile.jpg" />
          <img className="hero-image" src="/cover.jpg" alt="" />
        </picture>
        <div className="hero-shade" />
        <div className="hero-copy">
          <h1>
            The First Party Game
            <br />
            That Gives a Damn.
          </h1>
          <p>
            Just beans, obstacles and pure chaos —
            <br />
            free to play, the way it should be.
          </p>
        </div>
      </section>

      <section className="originals" id="originals">
        <h2 className="originals-title">Pick a Mode</h2>
        <div className="modes">
          {MODES.map((m) => (
            <a
              key={m.id}
              className="mode-card"
              href={`#${m.id}`}
              onClick={(e) => {
                e.preventDefault()
                onMode(m.id)
              }}
            >
              <ModeArt id={m.id} />
              <span className="card-badge">100% FREE</span>
              <span className="mode-card-text">
                <span className="mode-card-title">{m.title}</span>
                <span className="mode-card-tagline">{m.tagline}</span>
                <span className="mode-card-facts">
                  {m.facts.map((f) => (
                    <span key={f}>{f}</span>
                  ))}
                  <span>{m.maps.length} maps</span>
                </span>
              </span>
            </a>
          ))}
        </div>
      </section>
    </>
  )
}
