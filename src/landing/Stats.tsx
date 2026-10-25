import { useEffect, useState } from 'react'
import type { GameResult } from '../game/record'
import { MODES } from './data'
import { supabase } from './supabase'

// Your stats, on the account page: your skill rating in each mode (Supabase's player_skill: see
// supabase/skill.sql), and how it works; then, from every game you've played signed in (../game/record keeps
// them in Supabase's game_results table), your Party Games shows, round by round, and your Shoot Out matches,
// with the most recent games under them.

const RECENT = 15
const TITLES: Record<string, string> = Object.fromEntries(MODES.flatMap((m) => m.maps.map((map) => [map.id, map.title])))

type Mode = GameResult['mode']
type Rating = { mode: Mode; rating: number; games: number; streak: number }
// (Ratings null: not set up yet)
type Loaded = { status: 'loading' } | { status: 'missing' } | { status: 'failed' } | { status: 'ready'; results: GameResult[]; ratings: Rating[] | null }

const notThere = (code: string | undefined) => code === 'PGRST205' || code === '42P01'

async function loadResults(): Promise<Loaded> {
  if (!supabase) return { status: 'failed' }
  // (Each person's own only: the tables let you read no one else's. The most recent thousand games, at most.)
  const [games, skill] = await Promise.all([
    supabase.from('game_results').select('*').order('played_at', { ascending: false }).limit(1000),
    supabase.from('player_skill').select('mode, rating, games, streak'),
  ])
  if (games.error) return { status: notThere(games.error.code) ? 'missing' : 'failed' }
  return { status: 'ready', results: games.data as GameResult[], ratings: skill.error ? null : (skill.data as Rating[]) }
}

function ordinal(n: number) {
  const suffix = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (suffix[(v - 20) % 10] || suffix[v] || suffix[0])
}
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const percent = (part: number, whole: number) => (whole ? `${Math.round((100 * part) / whole)}%` : '—')
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

type Tile = { label: string; value: string | number; note?: string }

function Tiles({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="panel stat-grid">
      {tiles.map((t) => (
        <div key={t.label} className="stat">
          <div className="stat-value">
            {t.value}
            {t.note && <span className="stat-note">{t.note}</span>}
          </div>
          <div className="stat-label">{t.label}</div>
        </div>
      ))}
    </div>
  )
}

function partyTiles(rounds: GameResult[]): Tile[] {
  const shows = new Set(rounds.map((r) => r.show_id).filter(Boolean)).size
  const finals = rounds.filter((r) => r.round !== null && r.round === r.rounds)
  const qualifiers = rounds.filter((r) => !(r.round !== null && r.round === r.rounds))
  const through = qualifiers.filter((r) => r.outcome === 'through').length
  const won = rounds.filter((r) => r.outcome === 'won').length
  const best = finals.reduce<number | null>((b, r) => (r.place !== null && (b === null || r.place < b) ? r.place : b), null)
  return [
    { label: 'Shows played', value: shows },
    { label: 'Shows won', value: won, note: shows ? percent(won, shows) : undefined },
    { label: 'Finals reached', value: finals.length },
    { label: 'Rounds played', value: rounds.length },
    { label: 'Rounds qualified', value: through, note: qualifiers.length ? percent(through, qualifiers.length) : undefined },
    { label: 'Best final place', value: best === null ? '—' : ordinal(best) },
  ]
}

function shooterTiles(matches: GameResult[]): Tile[] {
  const wins = matches.filter((m) => m.outcome === 'won').length
  const kills = matches.reduce((n, m) => n + (m.kills ?? 0), 0)
  const deaths = matches.reduce((n, m) => n + (m.deaths ?? 0), 0)
  return [
    { label: 'Matches', value: matches.length },
    { label: 'Wins', value: wins },
    { label: 'Win rate', value: percent(wins, matches.length) },
    { label: 'Takedowns', value: kills },
    { label: 'Taken down', value: deaths },
    { label: 'K/D', value: matches.length ? (kills / Math.max(1, deaths)).toFixed(2) : '—' },
  ]
}

// ---------------------------------------------------------------------------------------------------------
// Skill ratings: shown times 1000, on the bots' scale (500 Normal, 1000 Hard)

const RATED: { mode: Mode; title: string; game: string; games: string }[] = [
  { mode: 'party-games', title: 'Party Games', game: 'show', games: 'shows' },
  { mode: 'shoot-out', title: 'Shoot Out', game: 'match', games: 'matches' },
]
const bots = (rating: number) => (rating < 0.25 ? 'Easy bots' : rating < 0.75 ? 'Normal bots' : rating < 1.1 ? 'Hard bots' : 'Elite bots')

// How the last few games have gone, if that's changing anything
function formOf(r: Rating) {
  const party = r.mode === 'party-games'
  if (r.streak <= -2) return `${-r.streak} ${party ? 'shows out before the final' : 'matches lost'} in a row: the bots are easing off a little${party ? ' in the qualifying rounds' : ''}`
  if (r.streak >= 2) return `${r.streak} ${party ? 'finals reached' : 'matches won'} in a row: the bots are pushing back a little`
  return null
}

function Ratings({ ratings }: { ratings: Rating[] | null }) {
  return (
    <>
      <div className="section-label">Skill rating</div>
      <div className="panel">
        <div className="rating-grid">
          {RATED.map(({ mode, title, game, games }) => {
            const r = ratings?.find((x) => x.mode === mode)
            const form = r && formOf(r)
            return (
              <div key={mode} className="stat">
                <div className="stat-value">
                  {r ? Math.round(r.rating * 1000) : '—'}
                  {r && <span className="stat-note">{bots(r.rating)}</span>}
                </div>
                <div className="stat-label">
                  {title} · {r ? `${r.games} ${r.games === 1 ? game : games} rated` : `not rated yet: finish a ${game}`}
                </div>
                {form && <div className="rating-form">{form}</div>}
              </div>
            )
          })}
        </div>
        <div className="rating-about">
          {ratings === null
            ? 'Ratings aren’t set up yet: run supabase/skill.sql in Supabase (see SUPABASE_SETUP.md).'
            : 'Your rating goes up and down with every show or match you finish, by how well you did for the bots you played. The bots then play at your rating: 500 is Normal, 1000 is Hard. After a few rough games in a row they ease off a little until you have a good one (in Party Games only in the qualifying rounds: the final is always played at your rating), and after a few good ones they push back a little. Leaving a game part way through counts as a loss.'}
        </div>
      </div>
    </>
  )
}

const OUTCOME: Record<GameResult['outcome'], string> = { through: 'Through', out: 'Out', won: 'Won', lost: 'Lost' }

function Recent({ results }: { results: GameResult[] }) {
  return (
    <div className="panel details">
      {results.slice(0, RECENT).map((r) => {
        const final = r.round !== null && r.round === r.rounds
        const parts =
          r.mode === 'party-games'
            ? [final ? 'Final' : r.round !== null && `Round ${r.round} of ${r.rounds}`, r.place !== null && `${ordinal(r.place)}${r.field ? ` of ${r.field}` : ''}`]
            : [r.team_score !== null && r.enemy_score !== null && `${r.team_score}–${r.enemy_score}`, `${r.kills ?? 0} takedowns`, `${r.deaths ?? 0} taken down`]
        if (r.seconds !== null) parts.push(clock(r.seconds))
        return (
          <div key={r.id} className="game">
            <div className="game-main">
              <div className="game-map">
                {TITLES[r.map] ?? r.map}
                <span className="game-mode">{r.mode === 'party-games' ? 'Party Games' : 'Shoot Out'}</span>
              </div>
              <div className="game-meta">{parts.filter(Boolean).join(' · ')}</div>
            </div>
            <div className="game-side">
              <span className={`badge badge-${r.outcome}`}>{r.outcome === 'won' && final ? 'Won the show' : OUTCOME[r.outcome]}</span>
              <span className="game-when">{when(r.played_at)}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

const Note = ({ text }: { text: string }) => (
  <div className="panel panel-empty">
    <div className="row">{text}</div>
  </div>
)

export function Stats() {
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' })
  useEffect(() => {
    let live = true
    loadResults().then((next) => {
      if (live) setLoaded(next)
    })
    return () => {
      live = false
    }
  }, [])

  if (loaded.status === 'loading') return <Note text="Loading your stats…" />
  if (loaded.status === 'missing') return <Note text="Stats aren’t set up yet: run supabase/game_results.sql in Supabase (see SUPABASE_SETUP.md)." />
  if (loaded.status === 'failed') return <Note text="Couldn’t load your stats. Check your connection and try again." />
  const { results, ratings } = loaded
  if (!results.length)
    return (
      <>
        <Ratings ratings={ratings} />
        <div className="section-label">Games</div>
        <Note text="No games yet. Play a Party Games show or a Shoot Out match signed in, and they’ll show up here." />
      </>
    )
  return (
    <>
      <Ratings ratings={ratings} />
      <div className="section-label">Party Games</div>
      <Tiles tiles={partyTiles(results.filter((r) => r.mode === 'party-games'))} />
      <div className="section-label">Shoot Out</div>
      <Tiles tiles={shooterTiles(results.filter((r) => r.mode === 'shoot-out'))} />
      <div className="section-label">Recent games</div>
      <Recent results={results} />
    </>
  )
}
