import { serverUrl, useNet } from './client'

// The online status, over the level: connecting, or online with your lag and who else is here (each in
// their bean's colour); or, with no server, what's wrong and where it was looked for.

export function NetHud() {
  const { status, ping, players, problem, lag } = useNet()
  const online = status === 'online'
  return (
    <div className="net-hud" aria-live="polite">
      <div className={`net-pill net-${status}`}>
        <span className="net-dot" />
        {online ? 'Online' : status === 'connecting' ? 'Connecting…' : status === 'offline' ? 'Offline' : 'Not connected'}
        {online && ping !== null && <span className="net-ping">{ping} ms</span>}
        {online && <span className="net-count">{players.length + 1} here</span>}
      </div>
      {online && (
        <ul className="net-players">
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
      )}
      {!online && problem && (
        <div className="net-problem">
          {problem}
          <span className="net-where">{serverUrl()}</span>
          {import.meta.env.DEV && <span className="net-where">Start it with: npm run server</span>}
        </div>
      )}
      {lag > 0 && <div className="net-lag">Simulated lag: +{lag} ms</div>}
    </div>
  )
}
