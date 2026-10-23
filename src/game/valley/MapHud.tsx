import { useEffect, useMemo, useRef, useState } from 'react'
import { CANYON, HALF_X, HALF_Z, PLAY_RIM, ROADS } from './ground'
import { tracker } from './hud'
import { PADS, RACKS, ZIPS } from './layout'
import { MESA, PLACES, RESERVOIR } from './places'
import { storm, stormAt, stormDepth } from './stormState'

// Dust Bowl Valley's map, in the top right corner: the valley inside its mountains, the canyon, the roads,
// every place (with a ring where its guns are), the jump pads and zip lines, the storm (purple) with the
// next zone ringed in white and a line to it while you're outside, and you (an arrow pointing the way the
// camera looks). Entering a place puts its name up in the middle of the screen for a moment.

const W = 220
const H = Math.round((W * HALF_Z) / HALF_X)
const sx = (x: number) => ((x + HALF_X) / (2 * HALF_X)) * W
const sz = (z: number) => ((z + HALF_Z) / (2 * HALF_Z)) * H
const scale = W / (2 * HALF_X)

const panel = { background: 'rgba(28, 22, 16, 0.6)', borderRadius: 10, padding: 6, pointerEvents: 'none' as const }

function rimPath() {
  const pts: string[] = []
  for (let i = 0; i <= 96; i++) {
    const a = (i / 96) * Math.PI * 2
    const c = Math.cos(a)
    const s = Math.sin(a)
    const x = HALF_X * PLAY_RIM * Math.sign(c) * Math.sqrt(Math.abs(c))
    const z = HALF_Z * PLAY_RIM * Math.sign(s) * Math.sqrt(Math.abs(s))
    pts.push(`${sx(x).toFixed(1)},${sz(z).toFixed(1)}`)
  }
  return `M${pts.join('L')}Z`
}

// The storm: purple everywhere but the safe circle; the next zone ringed; a line to it from outside
function drawStorm(area: SVGPathElement | null, zone: SVGCircleElement | null, route: SVGLineElement | null) {
  const s = stormAt(storm.time)
  const r = s.now.r * scale
  const cx = sx(s.now.x)
  const cy = sz(s.now.z)
  const hole = r > 0.05 ? `M${(cx - r).toFixed(1)},${cy.toFixed(1)}a${r.toFixed(1)},${r.toFixed(1)} 0 1 0 ${(2 * r).toFixed(1)},0a${r.toFixed(1)},${r.toFixed(1)} 0 1 0 ${(-2 * r).toFixed(1)},0Z` : ''
  area?.setAttribute('d', `M-2,-2H${W + 2}V${H + 2}H-2Z${hole}`)
  const next = s.next && s.next.r > 0 ? s.next : null
  if (zone) {
    zone.style.display = next ? '' : 'none'
    if (next) {
      zone.setAttribute('cx', sx(next.x).toFixed(1))
      zone.setAttribute('cy', sz(next.z).toFixed(1))
      zone.setAttribute('r', (next.r * scale).toFixed(1))
    }
  }
  const goal = next ?? s.now
  const off = tracker.live ? stormDepth(goal, tracker.x, tracker.z) : -1
  if (route) {
    route.style.display = off > 0 && !storm.down ? '' : 'none'
    if (off > 0) {
      const d = Math.hypot(tracker.x - goal.x, tracker.z - goal.z) || 1
      route.setAttribute('x1', sx(tracker.x).toFixed(1))
      route.setAttribute('y1', sz(tracker.z).toFixed(1))
      route.setAttribute('x2', sx(goal.x + ((tracker.x - goal.x) / d) * goal.r).toFixed(1))
      route.setAttribute('y2', sz(goal.z + ((tracker.z - goal.z) / d) * goal.r).toFixed(1))
    }
  }
}

export function MapHud() {
  const arrow = useRef<SVGGElement>(null)
  const stormArea = useRef<SVGPathElement>(null)
  const nextZone = useRef<SVGCircleElement>(null)
  const route = useRef<SVGLineElement>(null)
  const [place, setPlace] = useState<{ name: string; id: number } | null>(null)
  const inside = useRef<string | null>(null)
  const shown = useRef(0)

  const map = useMemo(
    () => ({
      rim: rimPath(),
      canyon: CANYON.map((p) => `${sx(p.x).toFixed(1)},${sz(p.z).toFixed(1)}`).join(' '),
      roads: ROADS.map((r) => ({ d: r.points.map((p, i) => `${i ? 'L' : 'M'}${sx(p[0]).toFixed(1)},${sz(p[1]).toFixed(1)}`).join(''), highway: r.kind === 'highway' })),
    }),
    [],
  )

  // Follow the player every frame (straight onto the SVG, no re-render), and notice entering a place
  useEffect(() => {
    let frame = 0
    const tick = () => {
      frame = requestAnimationFrame(tick)
      drawStorm(stormArea.current, nextZone.current, route.current)
      if (!tracker.live || !arrow.current) return
      const deg = (tracker.yaw * 180) / Math.PI
      arrow.current.setAttribute('transform', `translate(${sx(tracker.x).toFixed(1)} ${sz(tracker.z).toFixed(1)}) rotate(${deg.toFixed(1)})`)
      const here = PLACES.find((p) => {
        const r = p.id === 'mesa' ? MESA.topR : p.id === 'gorge' ? 30 : p.r + 4
        const d = p.to ? Math.hypot(tracker.x - p.x, Math.max(0, Math.abs(tracker.z - (p.z + p.to[1]) / 2) - Math.abs(p.to[1] - p.z) / 2)) : Math.hypot(tracker.x - p.x, tracker.z - p.z)
        return d < r
      })
      const id = here?.id ?? null
      if (id !== inside.current) {
        inside.current = id
        if (here) setPlace({ name: here.name, id: ++shown.current })
      }
    }
    tick()
    return () => cancelAnimationFrame(frame)
  }, [])

  // The name fades away on its own
  useEffect(() => {
    if (!place) return
    const t = window.setTimeout(() => setPlace((p) => (p?.id === place.id ? null : p)), 2600)
    return () => window.clearTimeout(t)
  }, [place])

  return (
    <>
      <div style={{ position: 'fixed', top: 64, right: 14, ...panel }}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
          <clipPath id="valley-map-clip">
            <rect x={0} y={0} width={W} height={H} rx={6} />
          </clipPath>
          <rect x={0} y={0} width={W} height={H} rx={6} fill="#8a5a3a" />
          <path d={map.rim} fill="#d6bc8f" stroke="#7a4f31" strokeWidth={1.5} />
          <polyline points={map.canyon} fill="none" stroke="#a8825a" strokeWidth={22 * scale} strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={sx(RESERVOIR.x)} cy={sz(RESERVOIR.z)} r={RESERVOIR.r * scale} fill="#4f8fa0" />
          {map.roads.map((r, i) => (
            <path key={i} d={r.d} fill="none" stroke={r.highway ? '#3d3d42' : '#9a9184'} strokeWidth={r.highway ? 9 * scale + 0.6 : 6 * scale + 0.3} />
          ))}
          <circle cx={sx(MESA.x)} cy={sz(MESA.z)} r={MESA.footR * scale} fill="#a0623f" stroke="#6f4027" strokeWidth={1} />
          {ZIPS.map((z, i) => (
            <line key={i} x1={sx(z.from[0])} y1={sz(z.from[2])} x2={sx(z.to[0])} y2={sz(z.to[2])} stroke="#2a2b30" strokeWidth={0.8} strokeDasharray="2 1.5" />
          ))}
          {PLACES.filter((p) => p.id !== 'mesa').map((p) => (
            <circle key={p.id} cx={sx(p.x)} cy={sz(p.to ? (p.z + p.to[1]) / 2 : p.z)} r={p.hot ? 3.4 : 2.6} fill={p.hot ? '#d6493b' : '#3d3328'} stroke="#f4eadb" strokeWidth={0.8} />
          ))}
          {RACKS.map((r, i) => (
            <rect key={i} x={sx(r.x) - 1.6} y={sz(r.z) - 1.6} width={3.2} height={3.2} transform={`rotate(45 ${sx(r.x)} ${sz(r.z)})`} fill="#f2a33a" stroke="#3d2a14" strokeWidth={0.5} />
          ))}
          {PADS.map((p, i) => (
            <circle key={i} cx={sx(p.x)} cy={sz(p.z)} r={1.6} fill="#f2c230" stroke="#3d2a14" strokeWidth={0.5} />
          ))}
          <g clipPath="url(#valley-map-clip)">
            <path ref={stormArea} fill="#7b3fd6" fillOpacity={0.48} fillRule="evenodd" stroke="#c9a4ff" strokeWidth={0.8} />
          </g>
          <circle ref={nextZone} fill="none" stroke="#fff" strokeWidth={1.4} style={{ display: 'none' }} />
          <line ref={route} stroke="#fff" strokeWidth={1.2} strokeDasharray="3 2" style={{ display: 'none' }} />
          <text x={W - 10} y={14} fill="#f4eadb" fontSize={11} fontWeight={800} textAnchor="middle" fontFamily="system-ui, sans-serif">
            N
          </text>
          <g ref={arrow}>
            <path d="M0,-6 L4.2,4.5 L0,2.4 L-4.2,4.5 Z" fill="#ff6b35" stroke="#fff" strokeWidth={1.1} strokeLinejoin="round" />
          </g>
        </svg>
      </div>
      {place && (
        <div key={place.id} style={{ position: 'fixed', top: '22%', left: 0, right: 0, textAlign: 'center', pointerEvents: 'none', animation: 'valley-place 2.6s ease forwards' }}>
          <style>{'@keyframes valley-place { 0% { opacity: 0; transform: translateY(8px) } 12% { opacity: 1; transform: none } 75% { opacity: 1 } 100% { opacity: 0 } }'}</style>
          <div style={{ font: "900 italic 30px 'Arial Black', 'Segoe UI Black', system-ui, sans-serif", color: '#fff8ea', letterSpacing: 1, textShadow: '0 2px 0 rgba(0,0,0,0.5), 0 0 12px rgba(0,0,0,0.45)' }}>
            {place.name.toUpperCase()}
          </div>
        </div>
      )}
    </>
  )
}
