import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { CrownIcon, DoorOpenIcon, GearIcon, SpeakerIcon } from './hudIcons'
import { leaveParty, isOnline } from './net/party'
import { recordLeaving } from './record'
import { getRaceView, standings, subscribeRace } from './race/race'
import { sfx } from './race/sound'
import { setVolume, useVolume } from './volume'

// The in-game menu, behind the cog in the top right: the volume, the prize pool (still to come: what the
// final round's top places would win, with that final's ranking as it stands, the crown for 1st), and the way
// out. Escape, or a click anywhere else, closes it.

const YOU = { name: 'You', colour: '#ff6b35' }
const PLACES = 3 // places shown in the prize pool

function ordinal(n: number) {
  const suffix = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (suffix[(v - 20) % 10] || suffix[v] || suffix[0])
}

function Volume() {
  const volume = useVolume()
  const percent = Math.round(volume * 100)
  const lastTick = useRef(0)
  return (
    <div className="game-menu-section">
      <div className="game-menu-heading">Volume</div>
      <label className="game-menu-volume">
        <SpeakerIcon muted={percent === 0} />
        <input
          type="range"
          min={0}
          max={100}
          value={percent}
          aria-label="Volume"
          onChange={(e) => {
            setVolume(Number(e.target.value) / 100)
            // (A tick now and then while sliding, to hear how loud it is)
            const now = performance.now()
            if (now - lastTick.current > 150) {
              lastTick.current = now
              sfx.tile()
            }
          }}
        />
        <b>{percent}</b>
      </label>
    </div>
  )
}

// The final's top places: who holds each (a tie at the top is everyone still standing), and their prize
function PrizePool({ final }: { final: boolean }) {
  useSyncExternalStore(subscribeRace, getRaceView) // (redrawn as the final's field goes out)
  const ranks = final ? standings(YOU) : []
  const rows = Array.from({ length: PLACES }, (_, i) => {
    const place = i + 1
    const holders = ranks.filter((r) => r.place === place)
    return { place, holders }
  })
  return (
    <div className="game-menu-section">
      <div className="game-menu-heading">
        Prize pool <span className="game-menu-soon">Coming soon</span>
      </div>
      <div className="game-menu-pool">
        <span>Pool</span>
        <b>— SOL</b>
      </div>
      <ol className="game-menu-ranks">
        {rows.map(({ place, holders }) => {
          const one = holders.length === 1 ? holders[0] : null
          return (
            <li key={place} className={`${place === 1 ? 'first' : ''}${one?.you ? ' you' : ''}`}>
              <span className="game-menu-rank">{place === 1 ? <CrownIcon size={20} /> : ordinal(place)}</span>
              <span className="game-menu-who">
                {one && <i style={{ background: one.colour }} />}
                {one ? one.name : holders.length > 1 ? `${holders.length} still standing` : '—'}
              </span>
              <span className="game-menu-prize">—</span>
            </li>
          )
        })}
      </ol>
      <p className="game-menu-note">{final ? "Paid out on this final's ranking." : "Paid out on the final round's ranking."}</p>
    </div>
  )
}

export function GameMenu({ leaveTo, final }: { leaveTo: string; final: boolean }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', key)
    window.addEventListener('pointerdown', away)
    return () => {
      window.removeEventListener('keydown', key)
      window.removeEventListener('pointerdown', away)
    }
  }, [open])

  return (
    <div className="game-menu" ref={box}>
      <button
        className={`game-menu-toggle${open ? ' active' : ''}`}
        aria-label="Settings"
        aria-expanded={open}
        onClick={(e) => {
          e.currentTarget.blur() // (keys go back to the game)
          setOpen((v) => !v)
        }}
      >
        <GearIcon />
      </button>
      {open && (
        // (Keys pressed in here, e.g. arrows on the slider, aren't the game's)
        <div
          className="game-menu-panel"
          role="dialog"
          aria-label="Settings"
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Escape') setOpen(false)
          }}
        >
          <Volume />
          <PrizePool final={final} />
          {/* (A game left part way through is kept as left early, ./record; and an online show's left for good,
              ./net/party) */}
          <a
            className="game-menu-leave"
            href={leaveTo}
            onClick={async (e) => {
              e.preventDefault()
              await recordLeaving()
              if (isOnline()) leaveParty()
              window.location.assign(leaveTo)
            }}
          >
            <DoorOpenIcon />
            Leave
          </a>
        </div>
      )}
    </div>
  )
}
