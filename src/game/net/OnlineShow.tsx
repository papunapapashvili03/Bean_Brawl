import { useEffect, useState } from 'react'
import { RaceHud, type ShowHud } from '../race/RaceHud'
import { COUNTDOWN_SECONDS, eliminate, getRaceView, playerFinishClock, raceClock, racers, type RaceView } from '../race/race'
import { recordGame, whileLeaving, type Outcome } from '../record'
import { OFFLINE_SHOW_URL, ONLINE_SHOW_URL, nextOnlineRound, type Show } from '../show'
import { net, serverNow, useNet } from './client'
import { leaveParty, party, showOver, tellDone, useParty } from './party'

// A party show played online (./party), over the race HUD: the online side of ../ShowDirector. My round's end
// goes to the server as it happens; the server says who's through each qualifying round (the first so many
// home, players and bots alike). Through, there's a break showing the next round, which starts on every
// screen at the same moment; not through, you're out. The final's the map's own: win it and you've won the
// show. And before all that, the lobby (PartyLobby): who's waiting, and how long till the show starts.

const LOAD_LEAD = 2000 // ms before the next round's clock starts that it's put on the screen
const NO_ANSWER = 8000 // ms connected without a lobby before it's taken that the server can't run shows

type Stage = 'playing' | 'break' | 'out' | 'won'

function ordinal(n: number) {
  const suffix = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (suffix[(v - 20) % 10] || suffix[v] || suffix[0])
}
const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function OnlineShowDirector({
  show,
  title,
  onRound,
  onLobby,
}: {
  show: Show
  title: (map: string) => string // a map's name
  onRound: (next: Show, at: number) => void // play the next round, its clock starting at `at` (the server's)
  onLobby: () => void
}) {
  const round = show.rounds[show.round]
  const quota = round.quota
  const last = show.rounds.length
  const [stage, setStage] = useState<Stage>('playing')
  const [home, setHome] = useState(0)
  const [left, setLeft] = useState(0)
  const [upcoming, setUpcoming] = useState<{ show: Show; at: number } | null>(null)
  const [outAt, setOutAt] = useState<{ place: number; of: number } | null>(null) // where you were when you went out

  useEffect(() => {
    if (stage !== 'playing') return
    // (Kept for the account page: see ../record)
    const record = (outcome: Outcome, place: number, view: RaceView) =>
      void recordGame({ mode: 'party-games', map: round.map, show_id: show.id, round: show.round + 1, rounds: last, outcome, place, field: view.field, seconds: view.elapsed })
    const check = window.setInterval(() => {
      const view = getRaceView()
      const mine = playerFinishClock()
      if (quota === null) {
        // The final: how it ends for me is mine to say
        if (view.phase === 'finished') {
          tellDone('won', mine ?? raceClock())
          record('won', view.place ?? 1, view)
          showOver()
          setStage('won')
        } else if (view.phase === 'eliminated') {
          tellDone('out', raceClock())
          record('out', view.place ?? view.field, view)
          setOutAt({ place: view.place ?? view.field, of: view.field })
          showOver()
          setStage('out')
        }
        return
      }
      if (mine !== null) tellDone('finish', mine)
      else if (view.phase === 'eliminated') tellDone('out', raceClock())
      setHome(Math.min(quota, racers().filter((r) => r.finishClock !== null).length + (mine !== null ? 1 : 0)))
      // The server's word on who's through
      const result = party.result
      if (!result || result.round !== show.round) return
      window.clearInterval(check)
      const place = result.through.indexOf(`p:${net.myId}`)
      if (place >= 0) {
        record('through', place + 1, view)
        setUpcoming({ show: nextOnlineRound(show, result.through), at: result.at })
        setStage('break')
      } else {
        record('out', view.position, view)
        setOutAt({ place: view.position, of: view.field })
        eliminate()
        leaveParty({ stay: true })
        setStage('out')
      }
    }, 200)
    return () => window.clearInterval(check)
  }, [stage, show, quota, round.map, last])

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

  // The break: counting down to the next round, put on the screen a moment before its clock starts
  useEffect(() => {
    if (stage !== 'break' || !upcoming) return
    const tick = window.setInterval(() => {
      const until = upcoming.at - serverNow()
      setLeft(Math.ceil(until / 1000))
      if (until <= LOAD_LEAD) {
        window.clearInterval(tick)
        onRound(upcoming.show, upcoming.at)
      }
    }, 200)
    return () => window.clearInterval(tick)
  }, [stage, upcoming, onRound])

  const again = [
    { label: 'Play again', onClick: () => window.location.assign(ONLINE_SHOW_URL), primary: true },
    { label: 'Lobby', onClick: onLobby },
  ]
  const roundName = quota === null ? 'Final' : `Round ${show.round + 1} of ${last}`
  const players = (show.humans?.length ?? 1) + show.bots.length
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
          ? { label: `Final · ${players} players` }
          : { label: `${roundName} · ${home}/${quota} through`, finishTitle: 'Home!', finishNote: `${home} of ${quota} home · waiting for the rest`, actions: [] }

  const nextRoundInfo = upcoming ? upcoming.show.rounds[upcoming.show.round] : null
  return (
    <>
      <RaceHud onRestart={() => window.location.assign(ONLINE_SHOW_URL)} show={hud} />
      {stage === 'break' && upcoming && nextRoundInfo && (
        <div className="show-break" role="status" aria-live="polite">
          <div className="show-break-card">
            <div className="show-break-kicker">{nextRoundInfo.quota === null ? 'Through to the final!' : 'Through!'}</div>
            <div className="show-break-round">{nextRoundInfo.quota === null ? 'Final' : `Round ${upcoming.show.round + 1} of ${last}`}</div>
            <div className="show-break-map">{title(nextRoundInfo.map)}</div>
            <div className="show-break-note">
              {(upcoming.show.humans?.length ?? 1) + upcoming.show.bots.length} players · {nextRoundInfo.quota === null ? 'win it to win the show' : `the first ${nextRoundInfo.quota} home go through`}
            </div>
            <div className="show-break-count">Starting in {Math.max(0, left)}</div>
          </div>
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Waiting for the show: joining, then the lobby filling up (or what's wrong)

export function PartyLobby({ onLobby }: { onLobby: () => void }) {
  const { phase, startAt, max, problem } = useParty()
  const { players, status, ping, problem: netProblem } = useNet()
  const reached = ping !== null // (the server's answered)
  const [now, setNow] = useState(() => serverNow())
  const [since, setSince] = useState(() => performance.now()) // when the server first answered
  const [late, setLate] = useState(false)
  useEffect(() => {
    const tick = window.setInterval(() => {
      setNow(serverNow())
      setLate(performance.now() - since > NO_ANSWER)
    }, 250)
    return () => window.clearInterval(tick)
  }, [since])
  useEffect(() => {
    if (!reached) return
    const t = window.setTimeout(() => setSince(performance.now()))
    return () => window.clearTimeout(t)
  }, [reached])
  if (phase === 'show' || phase === 'idle') return null

  const leave = () => {
    leaveParty()
    onLobby()
  }
  const failed = phase === 'failed'
  // (Can't reach it; or reached it, but it's said nothing: one that's not been updated to run shows)
  const unreachable = phase === 'connecting' && (status === 'offline' || (reached && late))
  return (
    <div className="show-break party-lobby" role="dialog" aria-modal="true" aria-labelledby="party-lobby-title">
      <div className="show-break-card">
        {failed || unreachable ? (
          <>
            <div id="party-lobby-title" className="show-break-kicker party-problem">
              {failed ? 'Show over' : status === 'offline' ? 'Can’t reach the server' : 'The server isn’t starting shows'}
            </div>
            <div className="show-break-note">{failed ? problem : status !== 'offline' ? 'It may need updating.' : (netProblem ?? 'Trying again…')}</div>
            <div className="party-actions">
              {failed ? (
                <button className="party-primary" onClick={() => window.location.assign(ONLINE_SHOW_URL)}>
                  Find another show
                </button>
              ) : (
                <button className="party-primary" onClick={() => window.location.assign(OFFLINE_SHOW_URL)}>
                  Play with bots instead
                </button>
              )}
              <button onClick={leave}>Lobby</button>
            </div>
          </>
        ) : phase === 'lobby' ? (
          <>
            <div id="party-lobby-title" className="show-break-kicker">
              Waiting for players
            </div>
            <div className="show-break-map">
              {players.length + 1}
              <span className="party-of"> / {max}</span>
            </div>
            <div className="show-break-note">The rest of the field will be bots</div>
            <ul className="party-players">
              <li>
                <span className="net-swatch" style={{ background: '#ff6b35' }} />
                You
              </li>
              {players.map((p) => (
                <li key={p.id}>
                  <span className="net-swatch" style={{ background: p.colour }} />
                  {p.name}
                </li>
              ))}
            </ul>
            <div className="show-break-count">{startAt !== null && startAt - now > 0 ? `Starting in ${clock(startAt - now)}` : 'Starting…'}</div>
            <div className="party-actions">
              <button onClick={leave}>Leave</button>
            </div>
          </>
        ) : (
          <>
            <div id="party-lobby-title" className="show-break-kicker">
              Joining a show…
            </div>
            <div className="party-actions">
              <button onClick={leave}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
