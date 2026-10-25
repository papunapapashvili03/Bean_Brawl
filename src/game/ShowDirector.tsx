import { useEffect, useState } from 'react'
import { RaceHud, type ShowHud } from './race/RaceHud'
import { COUNTDOWN_SECONDS, eliminate, getRaceView, playerFinishClock, raceClock, racers, type RaceView } from './race/race'
import { recordGame, whileLeaving, type Outcome } from './record'
import { endShow, nextRound, startShow, type Show } from './show'

// Runs a party show (./show) round by round, over the race HUD. A qualifying round closes as soon as its
// quota are home (the first 16, then the first 10): through, there's a short break showing the next round,
// and on to it with the bots that got through; not through, you're out. The final is the map's own: win
// it and you've won the show. Either way the cards offer another show, or the lobby. How each round went for
// you is kept (./record), for the account page.

const ROUND_CAP = 300 // seconds a qualifying round can run before it closes with whoever's home
const BREAK = 5 // seconds between rounds
const YOU = '' // (no bot is called that)

type Stage = 'playing' | 'break' | 'out' | 'won'

function ordinal(n: number) {
  const suffix = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (suffix[(v - 20) % 10] || suffix[v] || suffix[0])
}
export function ShowDirector({
  show,
  title,
  onRound,
  onLobby,
}: {
  show: Show
  title: (map: string) => string // a map's name
  onRound: (next: Show) => void // play this round (the next, or a new show's first)
  onLobby: () => void
}) {
  const round = show.rounds[show.round]
  const quota = round.quota
  const last = show.rounds.length
  const [stage, setStage] = useState<Stage>('playing')
  const [home, setHome] = useState(0)
  const [left, setLeft] = useState(BREAK)
  const [upcoming, setUpcoming] = useState<Show | null>(null)
  const [outAt, setOutAt] = useState<{ place: number; of: number } | null>(null) // where you were when you went out
  // Who's home, and whether the round's over
  useEffect(() => {
    if (stage !== 'playing') return
    // (Kept once, as the round's over for you)
    const record = (outcome: Outcome, place: number, view: RaceView) => {
      window.clearInterval(check)
      void recordGame({
        mode: 'party-games',
        map: show.rounds[show.round].map,
        show_id: show.id,
        round: show.round + 1,
        rounds: show.rounds.length,
        outcome,
        place,
        field: view.field,
        seconds: view.elapsed,
      })
    }
    const check = window.setInterval(() => {
      const view = getRaceView()
      if (quota === null) {
        if (view.phase === 'finished') {
          record('won', view.place ?? 1, view)
          setStage('won')
        } else if (view.phase === 'eliminated') {
          record('out', view.place ?? view.field, view)
          setOutAt({ place: view.place ?? view.field, of: view.field })
          setStage('out')
        }
        if (view.phase === 'finished' || view.phase === 'eliminated') endShow()
        return
      }
      const finished = racers()
        .filter((r) => r.finishClock !== null)
        .map((r) => ({ name: r.name, at: r.finishClock! }))
      const mine = playerFinishClock()
      if (mine !== null) finished.push({ name: YOU, at: mine })
      finished.sort((a, b) => a.at - b.at)
      setHome(Math.min(finished.length, quota))
      if (finished.length < quota && raceClock() < COUNTDOWN_SECONDS + ROUND_CAP) return
      const through = finished.slice(0, quota)
      const mineAt = through.findIndex((f) => f.name === YOU)
      if (mineAt >= 0) {
        record('through', mineAt + 1, view)
        setUpcoming(
          nextRound(
            show,
            through.filter((f) => f.name !== YOU).map((f) => f.name),
          ),
        )
        setStage('break')
      } else {
        // (In a race, where you'd got to when the last place through went)
        record('out', view.position, view)
        setOutAt({ place: view.position, of: view.field })
        eliminate()
        endShow()
        setStage('out')
      }
    }, 200)
    return () => window.clearInterval(check)
  }, [stage, show, quota])

  // Leaving before my show's over for me counts: out, left early (../record)
  useEffect(() => {
    if (stage !== 'playing' && stage !== 'break') return
    return whileLeaving(() => {
      // (Not before the first round's even started)
      if (show.round === 0 && raceClock() < COUNTDOWN_SECONDS) return null
      const view = getRaceView()
      return { mode: 'party-games', map: round.map, show_id: show.id, round: show.round + 1, rounds: last, outcome: 'out', place: view.position, field: view.field, seconds: view.elapsed }
    })
  }, [stage, show, round.map, last])

  // The break: counting down to the next round
  useEffect(() => {
    if (stage !== 'break' || !upcoming) return
    const started = Date.now()
    const tick = window.setInterval(() => {
      const remaining = BREAK - Math.floor((Date.now() - started) / 1000)
      setLeft(Math.max(0, remaining))
      if (remaining <= 0) {
        window.clearInterval(tick)
        onRound(upcoming)
      }
    }, 200)
    return () => window.clearInterval(tick)
  }, [stage, upcoming, onRound])

  const again = [
    { label: 'Play again', onClick: () => onRound(startShow()), primary: true },
    { label: 'Lobby', onClick: onLobby },
  ]
  const roundName = quota === null ? 'Final' : `Round ${show.round + 1} of ${last}`
  const hud: ShowHud =
    stage === 'won'
      ? { label: 'Final', finishNote: 'You won the show!', crown: true, actions: again }
      : stage === 'out'
        ? {
            label: roundName,
            finishTitle: 'Not through',
            outNote: `Out in ${quota === null ? 'the final' : `round ${show.round + 1} of ${last}`}${outAt ? ` · ${ordinal(outAt.place)} of ${outAt.of}` : ''}`,
            actions: again,
          }
        : quota === null
          ? { label: `Final · ${show.bots.length + 1} players` }
          : { label: `${roundName} · ${home}/${quota} through`, finishTitle: 'Through!', finishNote: `${home} of ${quota} home · waiting for the rest`, actions: [] }

  const nextRoundInfo = upcoming ? upcoming.rounds[upcoming.round] : null
  return (
    <>
      <RaceHud onRestart={() => onRound(startShow())} show={hud} />
      {stage === 'break' && upcoming && nextRoundInfo && (
        <div className="show-break" role="status" aria-live="polite">
          <div className="show-break-card">
            <div className="show-break-kicker">{nextRoundInfo.quota === null ? 'Through to the final!' : 'Through!'}</div>
            <div className="show-break-round">{nextRoundInfo.quota === null ? 'Final' : `Round ${upcoming.round + 1} of ${last}`}</div>
            <div className="show-break-map">{title(nextRoundInfo.map)}</div>
            <div className="show-break-note">
              {upcoming.bots.length + 1} players · {nextRoundInfo.quota === null ? 'win it to win the show' : `the first ${nextRoundInfo.quota} home go through`}
            </div>
            <div className="show-break-count">Starting in {left}</div>
          </div>
        </div>
      )}
    </>
  )
}
