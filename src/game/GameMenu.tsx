import { useEffect, useRef, useState } from 'react'
import { CrownIcon, DoorOpenIcon, GearIcon, SpeakerIcon } from './hudIcons'
import { sol } from '../landing/money'
import { leaveParty, isOnline, useParty } from './net/party'
import { recordLeaving } from './record'
import { sfx } from './race/sound'
import { setVolume, useVolume } from './volume'

// The in-game menu, behind the cog in the top right: the volume, the prize pool (in a show played for a
// stake: the pot, and what each paid place wins), and the way out. Escape, or a click anywhere else, closes it.

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

// The prize pool of a show played for a stake: the pot, and what each paid place wins (the pot less the
// site's fee, shared by place). Players only: bots never win money.
function PrizePool() {
  const { money, paid } = useParty()
  if (!money?.stake) {
    return (
      <div className="game-menu-section">
        <div className="game-menu-heading">Prize pool</div>
        <p className="game-menu-note">{money?.freed ? 'Too few players staked, so this show’s free: nothing was taken.' : 'A free game: nothing at stake.'}</p>
      </div>
    )
  }
  const prize = money.pot * (1 - money.fee)
  return (
    <div className="game-menu-section">
      <div className="game-menu-heading">Prize pool</div>
      <div className="game-menu-pool">
        <span>Pot · {sol(money.stake, 2)} SOL each</span>
        <b>{sol(money.pot)} SOL</b>
      </div>
      <ol className="game-menu-ranks">
        {money.split.map((share, i) => (
          <li key={i} className={`${i === 0 ? 'first' : ''}${paid?.place === i + 1 ? ' you' : ''}`}>
            <span className="game-menu-rank">{i === 0 ? <CrownIcon size={20} /> : ordinal(i + 1)}</span>
            <span className="game-menu-who">{paid?.place === i + 1 ? 'You' : `${Math.round(share * 100)}%`}</span>
            <span className="game-menu-prize">{sol(Math.floor(prize * share))} SOL</span>
          </li>
        ))}
      </ol>
      <p className="game-menu-note">
        Paid to the players only, by how far each gets in the show (bots never win money); the site keeps {Math.round(money.fee * 100)}%.
      </p>
    </div>
  )
}

export function GameMenu({ leaveTo }: { leaveTo: string }) {
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
          <PrizePool />
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
