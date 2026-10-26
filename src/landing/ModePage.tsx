import { useCallback, useEffect, useRef, useState } from 'react'
import { FLAGS, flagTexture, type FlagId } from '../game/flags'
import { SHADE_COLORS, setOutfit, useOutfit, type Outfit } from '../game/outfit'
import { CardArt } from './art'
import type { Account } from './auth'
import { CharacterStage, type Facing } from './CharacterStage'
import { FIELD, ONLINE_SHOW_URL, QUOTAS, ROUND_POOLS } from '../game/show'
import { modeById, playUrl, type Mode, type ModeId } from './data'
import { sol, useMoney } from './money'
import { OptionIcon, SlotGlyph } from './wardrobeIcons'

// A mode's page: the lobby. On the left, your bean in a spotlight, and along the foot of it the wardrobe, one
// round button per slot (hat, mask, sunglasses, back, patch) showing what's on; a slot opens a tray of
// everything for it, put on the moment it's clicked (and kept for every game). On the right, the mode and
// Play, which joins a game: "Joining the Server" counts up until one's found (Cancel backs out), then it
// loads in the games app. Party Games plays a show of three rounds (../game/show), so its side lays out the
// rounds and the maps each can be, and Play goes straight to the games app, which finds other players to
// play it with (../game/net/party). A show can be played free, or for a stake (one of the server's tiers,
// from your balance on the site: ./money); playing for one checks you're signed in, and that your balance
// covers it, first. Shoot Out plays one map, chosen here (or a random one).

const RANDOM = 'random'
const SEARCH_MIN = 2.5 // seconds a join takes, give or take
const SEARCH_SPREAD = 3
const FOUND_FOR = 1.1 // seconds "Server found" shows before the map loads

// ---------------------------------------------------------------------------------------------------------
// The wardrobe

type SlotId = 'hat' | 'face' | 'shades' | 'back' | 'flag'
type Option = { value: string; label: string }
const NONE: Option = { value: 'none', label: 'None' }
const SLOTS: { id: SlotId; title: string; facing: Facing; options: Option[] }[] = [
  {
    id: 'hat',
    title: 'Hat',
    facing: 'front',
    options: [
      NONE,
      { value: 'cap', label: 'Cap' },
      { value: 'topHat', label: 'Top hat' },
      { value: 'hardHat', label: 'Safety helmet' },
      { value: 'combatHelmet', label: 'Military helmet' },
    ],
  },
  {
    id: 'face',
    title: 'Mask',
    facing: 'front',
    options: [NONE, { value: 'medical', label: 'Medical mask' }, { value: 'fullMask', label: 'Full face mask' }],
  },
  {
    id: 'shades',
    title: 'Sunglasses',
    facing: 'front',
    options: [NONE, ...(Object.keys(SHADE_COLORS) as (keyof typeof SHADE_COLORS)[]).map((c) => ({ value: c, label: `${c[0].toUpperCase()}${c.slice(1)} frames` }))],
  },
  {
    id: 'back',
    title: 'Back',
    facing: 'back',
    options: [NONE, { value: 'backpack', label: 'Backpack' }, { value: 'military', label: 'Military pack' }],
  },
  {
    id: 'flag',
    title: 'Patch',
    facing: 'back',
    options: [NONE, ...(Object.entries(FLAGS) as [FlagId, string][]).map(([value, label]) => ({ value, label }))],
  },
]

// Each flag drawn once (by the game's own patch drawing) as a picture
const flagImages = new Map<FlagId, string>()
function flagImage(id: FlagId) {
  let url = flagImages.get(id)
  if (!url) {
    url = (flagTexture(id).image as HTMLCanvasElement).toDataURL()
    flagImages.set(id, url)
  }
  return url
}

// What a slot has on (a patch only shows on the military pack)
const worn = (outfit: Outfit, slot: SlotId) => (slot === 'flag' && outfit.back !== 'military' ? 'none' : outfit[slot])

function ItemPicture({ slot, value }: { slot: SlotId; value: string }) {
  if (slot === 'flag') return value === 'none' ? <OptionIcon slot="back" value="none" /> : <img className="item-flag" src={flagImage(value as FlagId)} alt="" />
  return <OptionIcon slot={slot} value={value} />
}

function Wardrobe({ open, onOpen, onWear }: { open: SlotId | null; onOpen: (slot: SlotId | null) => void; onWear: (facing: Facing) => void }) {
  const outfit = useOutfit()
  const slot = SLOTS.find((s) => s.id === open)
  const current = slot ? worn(outfit, slot.id) : 'none'

  const wear = (id: SlotId, value: string, facing: Facing) => {
    // (A patch goes on the military pack: picking one puts the pack on too)
    setOutfit(id === 'flag' ? (value === 'none' ? { flag: 'none' } : { flag: value as FlagId, back: 'military' }) : ({ [id]: value } as Partial<Outfit>))
    onWear(facing)
  }

  return (
    <div className="dock">
      {slot && (
        <div className="tray" id="wardrobe-tray" role="group" aria-label={slot.title}>
          <div className="tray-head">
            <span className="tray-title">{slot.title}</span>
            <span className="tray-worn">{slot.options.find((o) => o.value === current)?.label}</span>
            <button className="tray-close" aria-label="Close" onClick={() => onOpen(null)}>
              <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <div className={`tray-options${slot.id === 'flag' ? ' tray-flags' : ''}`}>
            {slot.options.map((o) => (
              <button
                key={o.value}
                className={`tray-option${current === o.value ? ' on' : ''}`}
                aria-pressed={current === o.value}
                aria-label={o.label}
                title={o.label}
                onClick={() => wear(slot.id, o.value, slot.facing)}
              >
                <ItemPicture slot={slot.id} value={o.value} />
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="dock-slots" role="toolbar" aria-label="Wardrobe">
        {SLOTS.map((s) => {
          const value = worn(outfit, s.id)
          return (
            <button
              key={s.id}
              className={`dock-slot${open === s.id ? ' open' : ''}`}
              aria-expanded={open === s.id}
              aria-controls={open === s.id ? 'wardrobe-tray' : undefined}
              onClick={() => onOpen(open === s.id ? null : s.id)}
            >
              <span className="dock-icon">{value === 'none' ? <SlotGlyph slot={s.id} /> : <ItemPicture slot={s.id} value={value} />}</span>
              <span className="dock-label">{s.title}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Party Games: the stake

const STAKE_KEY = 'fallguy.stake'
const savedStake = () => {
  try {
    return Number(localStorage.getItem(STAKE_KEY)) || 0
  } catch {
    return 0
  }
}

// How a pot's shared out (of what's left after the site's fee), by how many players stake on the show
const SHARES = 'The winner takes it all with 2 players, the top 2 share it with 3–4, the top 3 with 5 or more.'

function Stakes({ tier, onPick }: { tier: number; onPick: (tier: number) => void }) {
  const { config, me } = useMoney()
  const tiers = config?.on ? config.tiers : [0]
  const stake = tiers[tier] ?? 0
  return (
    <section className="lobby-maps" aria-labelledby="stake-label">
      <h2 id="stake-label" className="lobby-label">
        Stake{config?.on && config.network !== 'mainnet-beta' ? <span className="stake-net">devnet · test SOL</span> : null}
      </h2>
      <div className="stake-list" role="radiogroup" aria-labelledby="stake-label">
        {tiers.map((lamports, i) => (
          <button key={lamports} className="stake-choice" role="radio" aria-checked={tier === i} onClick={() => onPick(i)}>
            {lamports ? `${sol(lamports, 2)} SOL` : 'Free'}
          </button>
        ))}
      </div>
      <p className="stake-note">
        {!config?.on
          ? 'Playing for SOL isn’t switched on yet: shows are free.'
          : stake
            ? `Everyone in the show stakes ${sol(stake, 2)} SOL. The pot, less the site’s ${Math.round(config.fee * 100)}%, goes to the players who come top (bots never win money). ${SHARES} With fewer than 2 staking, the show’s free and nothing’s taken.${me ? ` Your balance: ${sol(me.balance)} SOL.` : ''}`
            : 'No stake: just for the crown.'}
      </p>
    </section>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Maps and Play

const savedMap = (mode: ModeId) => {
  try {
    return localStorage.getItem(`fallguy.map.${mode}`) ?? RANDOM
  } catch {
    return RANDOM
  }
}
const saveMap = (mode: ModeId, map: string) => {
  try {
    localStorage.setItem(`fallguy.map.${mode}`, map)
  } catch {
    // storage unavailable: the choice just isn't remembered
  }
}

function MapRow({ id, title, meta, on, onPick }: { id: string; title: string; meta: string; on: boolean; onPick: () => void }) {
  return (
    <button className="map-row" role="radio" aria-checked={on} onClick={onPick}>
      <span className="map-thumb">
        <CardArt id={id} />
      </span>
      <span className="map-row-text">
        <span className="map-row-title">{title}</span>
        <span className="map-row-meta">{meta}</span>
      </span>
      <span className="map-row-check" aria-hidden />
    </button>
  )
}

// Party Games: the three rounds of a show, and the maps each can be
function ShowPlan({ mode }: { mode: Mode }) {
  const last = ROUND_POOLS.length - 1
  const about = (i: number) =>
    i === 0
      ? `${FIELD.min}–${FIELD.max} players · first ${QUOTAS[0]} home go through`
      : i === last
        ? `${QUOTAS[i - 1]} players · win it to win the show`
        : `${QUOTAS[i - 1]} players · first ${QUOTAS[i]} home go through`
  return (
    <section className="lobby-maps" aria-labelledby="show-label">
      <h2 id="show-label" className="lobby-label">
        {ROUND_POOLS.length} rounds, a new map each
      </h2>
      <ol className="show-plan">
        {ROUND_POOLS.map((pool, i) => (
          <li key={i} className="show-round">
            <div className="show-round-head">
              <span className="show-round-name">{i === last ? 'Final' : `Round ${i + 1}`}</span>
              <span className="show-round-about">{about(i)}</span>
            </div>
            <div className="show-round-maps">
              {pool.map((id) => (
                <span key={id} className="show-map">
                  <span className="map-thumb">
                    <CardArt id={id} />
                  </span>
                  {mode.maps.find((m) => m.id === id)?.title ?? id}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

// Where Play goes once a server's found: what to say about it, and the address
type Target = { label: string; url: string }

// Joining a game: counting up until a server's found (Cancel backs out), then off to it
function Joining({ mode, waiting, resolve, onCancel }: { mode: Mode; waiting: string; resolve: () => Target; onCancel: () => void }) {
  const [elapsed, setElapsed] = useState(0)
  const [found, setFound] = useState<Target | null>(null)
  const cancel = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancel.current?.focus()
    const started = Date.now()
    const tick = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 250)
    const wait = (SEARCH_MIN + Math.random() * SEARCH_SPREAD) * 1000
    let go = 0
    const search = window.setTimeout(() => {
      const target = resolve()
      setFound(target)
      go = window.setTimeout(() => window.location.assign(target.url), FOUND_FOR * 1000)
    }, wait)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearInterval(tick)
      window.clearTimeout(search)
      window.clearTimeout(go)
      window.removeEventListener('keydown', onKey)
    }
  }, [resolve, onCancel])

  const clock = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`
  return (
    <div className="joining" role="dialog" aria-modal="true" aria-labelledby="joining-title">
      <div className="joining-card">
        <div className={`joining-spinner${found ? ' done' : ''}`} aria-hidden>
          <span />
        </div>
        <div id="joining-title" className="joining-title" aria-live="polite">
          {found ? 'Server found!' : 'Joining the Server'}
        </div>
        <div className="joining-count">{clock}</div>
        <div className="joining-map">
          {mode.title} · {found ? found.label : waiting}
        </div>
        <button ref={cancel} className="joining-cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------

export function ModePage({
  mode: id,
  account,
  ready,
  onSignIn,
  onRegister,
  onWallet,
}: {
  mode: ModeId
  account: Account | null
  ready: boolean
  onSignIn: () => void
  onRegister: () => void
  onWallet: () => void
}) {
  const mode = modeById(id)
  const [map, setMap] = useState(() => {
    const saved = savedMap(id)
    return saved === RANDOM || mode.maps.some((m) => m.id === saved) ? saved : RANDOM
  })
  const [facing, setFacing] = useState<Facing>('front')
  const [hops, setHops] = useState(0)
  const [slot, setSlot] = useState<SlotId | null>(null)
  const [joining, setJoining] = useState(false)
  const stopJoining = useCallback(() => setJoining(false), [])
  const stage = useRef<HTMLDivElement>(null)

  // The wardrobe's tray closes with Esc, or a click anywhere off the stage
  useEffect(() => {
    if (!slot) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSlot(null)
    }
    const onDown = (e: PointerEvent) => {
      if (!stage.current?.contains(e.target as Node)) setSlot(null)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [slot])

  const openSlot = (next: SlotId | null) => {
    setSlot(next)
    const s = SLOTS.find((x) => x.id === next)
    if (s) setFacing(s.facing)
  }
  const pick = (next: string) => {
    setMap(next)
    saveMap(id, next)
  }
  const chosen = mode.maps.find((m) => m.id === map) ?? null
  const party = id === 'party-games'
  const money = useMoney()
  const [tier, setTier] = useState(savedStake)
  const tiers = money.config?.on ? money.config.tiers : [0]
  const stake = tiers[tier] ?? 0
  const pickTier = (next: number) => {
    setTier(next)
    try {
      localStorage.setItem(STAKE_KEY, String(next))
    } catch {
      // (not remembered)
    }
  }
  // Play: a show (free, or for the stake: signed in, not as a guest, with the balance for it), or a map
  const play = () => {
    if (!party) return setJoining(true)
    // (Trying it out against the game server on this computer: the games use it too)
    const local = new URLSearchParams(window.location.search).get('mp') === 'local' ? '&mp=local' : ''
    if (!stake) return window.location.assign(`${ONLINE_SHOW_URL}${local}`)
    // (The game server says who it knows you as: no balance from it, and it's sign in, or register)
    if (money.status === 'signed-out') return onSignIn()
    if (money.status === 'guest') return onRegister()
    if (!money.me || money.me.balance < stake) return onWallet()
    const dev = new URLSearchParams(window.location.search).get('devuser')
    window.location.assign(`${ONLINE_SHOW_URL}&stake=${tier}${local}${import.meta.env.DEV && dev ? `&devuser=${encodeURIComponent(dev)}` : ''}`)
  }

  // Once a server's found: the map chosen (or a random one)
  const resolve = useCallback((): Target => {
    const title = (m: string) => mode.maps.find((x) => x.id === m)?.title ?? m
    const pickId = map === RANDOM ? mode.maps[Math.floor(Math.random() * mode.maps.length)].id : map
    return { label: title(pickId), url: playUrl(mode.id, pickId) }
  }, [mode, map])
  return (
    <main className="lobby">
      <div className="lobby-stage" ref={stage}>
        <CharacterStage facing={facing} hops={hops} lifted={slot !== null}>
          {ready && (
            <div className="nameplate">
              {account ? (
                <>
                  <span className="nameplate-dot" aria-hidden />
                  {account.name}
                </>
              ) : (
                <>
                  Guest
                  <button onClick={onSignIn}>Sign in</button>
                </>
              )}
            </div>
          )}
          <Wardrobe
            open={slot}
            onOpen={openSlot}
            onWear={(f) => {
              setFacing(f)
              setHops((n) => n + 1)
            }}
          />
        </CharacterStage>
      </div>

      <aside className="lobby-side">
        <header className="lobby-head">
          <h1 className="lobby-title">{mode.title}</h1>
          <p className="lobby-tagline">{mode.tagline}</p>
          <p className="lobby-facts">{mode.facts.join(' · ')}</p>
        </header>

        {party ? (
          <>
            <ShowPlan mode={mode} />
            <Stakes tier={tiers[tier] === undefined ? 0 : tier} onPick={pickTier} />
          </>
        ) : (
          <section className="lobby-maps" aria-labelledby="maps-label">
            <h2 id="maps-label" className="lobby-label">
              Map
            </h2>
            <div className="map-list" role="radiogroup" aria-labelledby="maps-label">
              <MapRow id="random" title="Random" meta={`Any of ${mode.maps.length}`} on={map === RANDOM} onPick={() => pick(RANDOM)} />
              {mode.maps.map((m) => (
                <MapRow key={m.id} id={m.id} title={m.title} meta={m.meta} on={map === m.id} onPick={() => pick(m.id)} />
              ))}
            </div>
          </section>
        )}

        <div className="lobby-play">
          <div className="lobby-play-info">
            <div className="lobby-play-map">{party ? `${ROUND_POOLS.length} rounds` : chosen ? chosen.title : 'Random map'}</div>
            <div className="lobby-play-note">
              {party
                ? `Up to 10 players: the lobby waits 30 seconds for them, and bots fill the rest of the field.${stake ? ` Stake: ${sol(stake, 2)} SOL.` : ''}`
                : chosen
                  ? chosen.blurb
                  : `Any of the ${mode.maps.length} maps: you'll see which when the server's found.`}
            </div>
          </div>
          <button className="play" onClick={play}>
            {stake ? `Play · ${sol(stake, 2)} SOL` : 'Play'}
          </button>
        </div>
      </aside>

      {joining && (
        <Joining mode={mode} waiting={party ? `${ROUND_POOLS.length} rounds` : chosen ? chosen.title : 'Random map'} resolve={resolve} onCancel={stopJoining} />
      )}
    </main>
  )
}
