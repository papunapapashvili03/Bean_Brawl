import { useEffect, useRef, type CSSProperties, type MouseEvent } from 'react'
import { now, useAmmo, type Reload } from './ammo'
import { GUNS, type AmmoKind, type GunSpec, type IconShape } from './catalog'
import { THROWABLES, THROW_KINDS, type ThrowKind } from './throwables/catalog'
import { ThrowIcon } from './throwables/icons'
import type { Pouch } from './throwables/pouch'

// Fortnite-style weapon HUD, bottom right (left of the Wardrobe button): the ammo readout with the gun's
// name under it, then the hotbar. Slot 1 is empty hands, slots 2 and 3 hold guns, slot 4 throwables.

export type Slot = 1 | 2 | 3 | 4

const HEAVY = "900 italic 16px 'Arial Black', 'Segoe UI Black', system-ui, sans-serif"
const shadow = '0 2px 0 rgba(0, 0, 0, 0.45), 0 0 6px rgba(0, 0, 0, 0.35)'

// ---------------------------------------------------------------------------------------------------------
// Ammo icons: many small bullets (light, SMGs), three big bullets (medium, assault rifles), two shells

function Bullet({ x, y, w, h, color }: { x: number; y: number; w: number; h: number; color: string }) {
  const tip = w * 0.9
  return (
    <g>
      <path d={`M${x} ${y + tip} Q${x + w / 2} ${y - tip * 0.25} ${x + w} ${y + tip} Z`} fill="#e0a24a" />
      <rect x={x} y={y + tip} width={w} height={h - tip} rx={w * 0.12} fill={color} />
      <rect x={x} y={y + h - w * 0.35} width={w} height={w * 0.35} fill="rgba(0,0,0,0.25)" />
    </g>
  )
}

function Shell({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h * 0.72} rx={w * 0.25} fill="#4fc26a" />
      <rect x={x - w * 0.08} y={y + h * 0.72} width={w * 1.16} height={h * 0.28} rx={w * 0.1} fill="#e0b04a" />
      <rect x={x + w * 0.2} y={y + h * 0.1} width={w * 0.18} height={h * 0.5} rx={w * 0.09} fill="rgba(255,255,255,0.35)" />
    </g>
  )
}

export function AmmoIcon({ kind, size = 24 }: { kind: AmmoKind; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {kind === 'light' &&
        [0, 1, 2].flatMap((col) =>
          [0, 1].map((row) => (
            <Bullet key={`${col}${row}`} x={3 + col * 6.5} y={1.5 + row * 11} w={4} h={10} color="#d7dbe0" />
          )),
        )}
      {kind === 'medium' &&
        [0, 1, 2].map((i) => <Bullet key={i} x={2.5 + i * 6.8} y={1.5} w={5.4} h={21} color="#9ccf6a" />)}
      {kind === 'shells' && [0, 1].map((i) => <Shell key={i} x={4 + i * 9} y={3} w={7} h={19} />)}
      {kind === 'heavy' && [0, 1].map((i) => <Bullet key={i} x={4.5 + i * 8.5} y={0.5} w={6.5} h={23} color="#8b949e" />)}
      {kind === 'capsules' &&
        // Two small metal capsules: brass nose, red band
        [0, 1].map((i) => (
          <g key={i} transform={`translate(${3.5 + i * 9} 2)`}>
            <rect x={0} y={0} width={7.5} height={20} rx={3.75} fill="#8d939c" />
            <path d="M0 3.75 A3.75 3.75 0 0 1 7.5 3.75 L7.5 6 L0 6 Z" fill="#c9a24a" />
            <rect x={0} y={8} width={7.5} height={2.4} fill="#b3262a" />
          </g>
        ))}
      {kind === 'rockets' && (
        // A rocket standing up: olive warhead, orange band, dark body and fins
        <g>
          <path d="M12 1 Q16 5 16 10 L8 10 Q8 5 12 1 Z" fill="#8a9a3a" />
          <rect x={8} y={10} width={8} height={2.5} fill="#e0782a" />
          <rect x={9} y={12.5} width={6} height={7.5} fill="#3a3c40" />
          <path d="M9 16 L5.5 22 L9 20.5 Z M15 16 L18.5 22 L15 20.5 Z" fill="#3a3c40" />
        </g>
      )}
    </svg>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Gun icon: the side-view silhouette, tilted like a loot icon

const ICON_TILT = 30 // degrees, muzzle up to the right like a loot icon
const ICON_STRETCH: [number, number] = [1.05, 1.15] // a touch of the models' chunky proportions

// Scale and centre a gun's shapes to fill the tile whatever its size (a pistol or a rocket launcher)
function iconFit(shapes: IconShape[]) {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  const add = (x: number, y: number) => {
    x0 = Math.min(x0, x)
    y0 = Math.min(y0, y)
    x1 = Math.max(x1, x)
    y1 = Math.max(y1, y)
  }
  for (const s of shapes) {
    if ('rect' in s) {
      add(s.rect[0], s.rect[1])
      add(s.rect[2], s.rect[3])
    } else if ('circle' in s) {
      add(s.circle[0] - s.circle[2], s.circle[1] - s.circle[2])
      add(s.circle[0] + s.circle[2], s.circle[1] + s.circle[2])
    } else s.poly.forEach(([x, y]) => add(x, y))
  }
  const hw = ((x1 - x0) / 2) * ICON_STRETCH[0]
  const hh = ((y1 - y0) / 2) * ICON_STRETCH[1]
  const a = (ICON_TILT * Math.PI) / 180
  const reach = Math.max(hw * Math.cos(a) + hh * Math.sin(a), hw * Math.sin(a) + hh * Math.cos(a))
  return { scale: 0.8 / reach, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 }
}

function GunIcon({ gun }: { gun: GunSpec }) {
  const { scale, cx, cy } = iconFit(gun.icon)
  const sx = scale * ICON_STRETCH[0]
  const sy = scale * ICON_STRETCH[1]
  return (
    <svg width="100%" height="100%" viewBox="-0.85 -0.85 1.7 1.7" aria-hidden="true">
      <g
        transform={`rotate(-${ICON_TILT}) scale(${sx} ${-sy}) translate(${-cx} ${-cy})`}
        stroke="rgba(0,0,0,0.55)"
        strokeWidth={0.012 / scale}
        strokeLinejoin="round"
      >
        {gun.icon.map((s, i) =>
          'rect' in s ? (
            <rect key={i} x={s.rect[0]} y={s.rect[1]} width={s.rect[2] - s.rect[0]} height={s.rect[3] - s.rect[1]} fill={s.color} />
          ) : 'circle' in s ? (
            <circle key={i} cx={s.circle[0]} cy={s.circle[1]} r={s.circle[2]} fill={s.color} />
          ) : (
            <polygon key={i} points={s.poly.map((p) => p.join(',')).join(' ')} fill={s.color} />
          ),
        )}
      </g>
    </svg>
  )
}

// Slot 1: the character's own mitten fist
function FistIcon() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 24 24" aria-hidden="true">
      <g stroke="#1b1b1f" strokeWidth={1.2}>
        <ellipse cx={12.5} cy={13} rx={6.5} ry={5.8} fill="#ff6b35" />
        <ellipse cx={7.2} cy={15.2} rx={2.4} ry={2} fill="#ff6b35" />
      </g>
      {/* Knuckles */}
      <g stroke="#1b1b1f" strokeWidth={0.9} fill="none" strokeLinecap="round">
        <path d="M11 8.2 Q12 9.6 11.2 11" />
        <path d="M14 7.6 Q15 9.1 14.2 10.6" />
        <path d="M16.8 8.6 Q17.6 9.9 17 11.2" />
      </g>
    </svg>
  )
}

// ---------------------------------------------------------------------------------------------------------

function shade(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16)
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * amount))
  return `rgb(${c.join(',')})`
}

const tileBase: CSSProperties = {
  position: 'relative',
  width: 58,
  height: 58,
  padding: 0,
  borderRadius: 8,
  boxSizing: 'border-box',
  cursor: 'pointer',
  pointerEvents: 'auto',
  transition: 'transform 120ms ease, box-shadow 120ms ease',
}

function Tile({
  slot,
  gun,
  rounds,
  active,
  onSelect,
}: {
  slot: Slot
  gun: GunSpec | null
  rounds: number // magazine + reserve
  active: boolean
  onSelect: (slot: Slot) => void
}) {
  const background = gun
    ? `linear-gradient(160deg, ${shade(gun.rarity, 0.95)} 0%, ${shade(gun.rarity, 0.45)} 100%)`
    : slot === 1
      ? 'rgba(40, 44, 54, 0.8)'
      : 'rgba(0, 0, 0, 0.3)'
  const style: CSSProperties = {
    ...tileBase,
    background,
    border: active ? '3px solid #ffffff' : gun || slot === 1 ? '2px solid rgba(255,255,255,0.35)' : '2px dashed rgba(255,255,255,0.25)',
    transform: active ? 'translateY(-6px) scale(1.06)' : 'none',
    boxShadow: active ? '0 6px 14px rgba(0,0,0,0.35)' : 'none',
  }
  return (
    <button
      style={style}
      aria-label={gun ? `Slot ${slot}: ${gun.name}` : slot === 1 ? 'Slot 1: hands' : `Slot ${slot}: empty`}
      aria-pressed={active}
      onClick={(e: MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.blur()
        onSelect(slot)
      }}
    >
      <span style={{ position: 'absolute', inset: 4 }}>{gun ? <GunIcon gun={gun} /> : slot === 1 ? <FistIcon /> : null}</span>
      <span style={{ position: 'absolute', top: 2, left: 5, font: '800 11px system-ui, sans-serif', color: 'rgba(255,255,255,0.85)', textShadow: shadow }}>
        {slot}
      </span>
      {gun && (
        <span
          style={{
            position: 'absolute',
            right: 3,
            bottom: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            font: HEAVY,
            fontSize: 12,
            color: rounds > 0 ? '#fff' : '#ff6b6b',
            textShadow: shadow,
          }}
        >
          {rounds}
          <AmmoIcon kind={gun.ammo} size={12} />
        </span>
      )}
    </button>
  )
}

// Slot 4: the throwable in hand with how many you have, and above it the other kinds you carry (press 4
// again to switch)
function ThrowTile({ pouch, active, onSelect }: { pouch: Pouch; active: boolean; onSelect: (slot: Slot) => void }) {
  const kind = pouch.selected
  const spec = kind ? THROWABLES[kind] : null
  const carried = THROW_KINDS.filter((k) => pouch.counts[k] > 0)
  const style: CSSProperties = {
    ...tileBase,
    background: spec
      ? `linear-gradient(160deg, ${shade(spec.rarity, 0.95)} 0%, ${shade(spec.rarity, 0.45)} 100%)`
      : 'rgba(0, 0, 0, 0.3)',
    border: active ? '3px solid #ffffff' : spec ? '2px solid rgba(255,255,255,0.35)' : '2px dashed rgba(255,255,255,0.25)',
    transform: active ? 'translateY(-6px) scale(1.06)' : 'none',
    boxShadow: active ? '0 6px 14px rgba(0,0,0,0.35)' : 'none',
  }
  return (
    <button
      style={style}
      aria-label={spec ? `Slot 4: ${spec.name}` : 'Slot 4: empty'}
      aria-pressed={active}
      onClick={(e: MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.blur()
        onSelect(4)
      }}
    >
      {carried.length > 1 && (
        <span style={{ position: 'absolute', left: 0, right: 0, bottom: '100%', marginBottom: 5, display: 'flex', justifyContent: 'center', gap: 2 }}>
          {carried.map((k) => (
            <span key={k} style={{ opacity: k === kind ? 1 : 0.55, filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.5))' }}>
              <ThrowIcon kind={k} size={16} />
            </span>
          ))}
        </span>
      )}
      <span style={{ position: 'absolute', inset: 6 }}>{kind && <ThrowIcon kind={kind} />}</span>
      <span style={{ position: 'absolute', top: 2, left: 5, font: '800 11px system-ui, sans-serif', color: 'rgba(255,255,255,0.85)', textShadow: shadow }}>
        4
      </span>
      {kind && (
        <span style={{ position: 'absolute', right: 4, bottom: 1, font: HEAVY, fontSize: 13, color: '#fff', textShadow: shadow }}>
          {pouch.counts[kind]}
        </span>
      )}
    </button>
  )
}

// The throwable in hand: how many, and its name
function ThrowReadout({ kind, count }: { kind: ThrowKind; count: number }) {
  return (
    <div style={{ textAlign: 'right', color: '#fff', textShadow: shadow, paddingBottom: 6, minWidth: 150 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 7 }}>
        <span style={{ font: HEAVY, fontSize: 30, lineHeight: 1 }}>{count}</span>
        <ThrowIcon kind={kind} size={28} />
      </div>
      <div style={{ font: HEAVY, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 4 }}>
        {THROWABLES[kind].name}
      </div>
    </div>
  )
}

// How far a reload has got (0..1) and how long it has left (ms)
function reloadProgress(reload: Reload) {
  const done = Math.min(1, Math.max(0, (now() - reload.start) / reload.duration))
  return { done, left: (1 - done) * reload.duration * 1000 }
}

// A bar that fills over the rest of the reload
function ReloadBar({ reload }: { reload: Reload }) {
  const fill = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const { done, left } = reloadProgress(reload)
    fill.current?.animate([{ width: `${done * 100}%` }, { width: '100%' }], { duration: left, fill: 'forwards' })
  }, [reload])
  return (
    <div style={{ height: 5, marginTop: 5, borderRadius: 3, background: 'rgba(0,0,0,0.45)', overflow: 'hidden' }}>
      <div ref={fill} style={{ height: '100%', width: 0, background: '#ffffff' }} />
    </div>
  )
}

// Magazine | reserve with the ammo type, and the gun's name underneath (or the reload filling up)
function AmmoReadout({ gun, mag, reserve, reload }: { gun: GunSpec; mag: number; reserve: number; reload: Reload | null }) {
  const empty = mag === 0
  return (
    <div style={{ textAlign: 'right', color: '#fff', textShadow: shadow, paddingBottom: 6, minWidth: 150 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 7 }}>
        <span style={{ font: HEAVY, fontSize: 30, lineHeight: 1, color: empty ? '#ff6b6b' : '#fff' }}>{mag}</span>
        <span style={{ width: 2, height: 22, background: 'rgba(255,255,255,0.75)', transform: 'skewX(-12deg)' }} />
        <span style={{ font: HEAVY, fontSize: 20, lineHeight: 1, opacity: 0.9, color: reserve === 0 ? '#ff6b6b' : '#fff' }}>{reserve}</span>
        <AmmoIcon kind={gun.ammo} size={26} />
      </div>
      <div style={{ font: HEAVY, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 4 }}>
        {reload ? 'Reloading' : empty && reserve === 0 ? 'Out of ammo' : gun.name}
      </div>
      {reload && <ReloadBar reload={reload} />}
    </div>
  )
}

export function GunHud({
  slots,
  active,
  pouch,
  onSelect,
}: {
  slots: [number | null, number | null] // guns in slots 2 and 3
  active: Slot
  pouch: Pouch // throwables, in slot 4
  onSelect: (slot: Slot) => void
}) {
  const { mag, reserve, reload } = useAmmo()
  const inHand = active === 2 || active === 3 ? slots[active - 2] : null
  const throwable = active === 4 ? pouch.selected : null
  return (
    <div style={{ position: 'absolute', right: 132, bottom: 16, display: 'flex', alignItems: 'flex-end', gap: 16, pointerEvents: 'none' }}>
      {inHand !== null && (
        <AmmoReadout
          gun={GUNS[inHand]}
          mag={mag[inHand]}
          reserve={reserve[inHand]}
          reload={reload?.gun === inHand ? reload : null}
        />
      )}
      {throwable && <ThrowReadout kind={throwable} count={pouch.counts[throwable]} />}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
        <Tile slot={1} gun={null} rounds={0} active={active === 1} onSelect={onSelect} />
        {slots.map((g, i) => (
          <Tile
            key={i}
            slot={(i + 2) as Slot}
            gun={g === null ? null : GUNS[g]}
            rounds={g === null ? 0 : mag[g] + reserve[g]}
            active={active === i + 2}
            onSelect={onSelect}
          />
        ))}
        <ThrowTile pouch={pouch} active={active === 4} onSelect={onSelect} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Reticle, in the middle of the screen: a small white dot with a black outline, or for shotguns a wide
// hollow circle as big as the pellet spread. While reloading, a ring fills around it.

const RING_R = 16
const RING_C = 2 * Math.PI * RING_R

function ReloadRing({ reload }: { reload: Reload }) {
  const arc = useRef<SVGCircleElement>(null)
  useEffect(() => {
    const { done, left } = reloadProgress(reload)
    arc.current?.animate([{ strokeDashoffset: RING_C * (1 - done) }, { strokeDashoffset: 0 }], { duration: left, fill: 'forwards' })
  }, [reload])
  const size = RING_R * 2 + 8
  return (
    <svg
      width={size}
      height={size}
      style={{ position: 'absolute', left: '50%', top: '50%', margin: `${-size / 2}px 0 0 ${-size / 2}px`, transform: 'rotate(-90deg)' }}
    >
      <circle cx={size / 2} cy={size / 2} r={RING_R} fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth={4} />
      <circle
        ref={arc}
        cx={size / 2}
        cy={size / 2}
        r={RING_R}
        fill="none"
        stroke="#ffffff"
        strokeWidth={3}
        strokeDasharray={RING_C}
        strokeDashoffset={RING_C}
      />
    </svg>
  )
}

export function Reticle({ circle, reload }: { circle: number | null; reload: Reload | null }) {
  const centred = (size: number): CSSProperties => ({
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: size,
    height: size,
    margin: `${-size / 2}px 0 0 ${-size / 2}px`,
    borderRadius: '50%',
    boxSizing: 'border-box',
    pointerEvents: 'none',
  })
  return (
    <>
      {circle === null ? (
        <div style={{ ...centred(12), background: '#ffffff', border: '2px solid #000000' }} />
      ) : (
        // Hollow circle: white ring outlined in black inside and out, with a tiny centre dot
        <>
          <div style={{ ...centred(circle * 2), border: '2px solid #ffffff', boxShadow: '0 0 0 1px #000, inset 0 0 0 1px #000' }} />
          <div style={{ ...centred(4), background: '#ffffff', boxShadow: '0 0 0 1px #000' }} />
        </>
      )}
      {reload && <ReloadRing reload={reload} />}
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Sniper scope: the screen goes black around a round window, with a fine crosshair that thickens into posts
// towards the rim, a slight darkening at the edge of the lens, and the magnification

export function ScopeView({ radius, magnification }: { radius: number; magnification: number }) {
  const full: CSSProperties = { position: 'absolute', inset: 0, pointerEvents: 'none' }
  const line = (horizontal: boolean, from: number, to: number, thickness: number): CSSProperties => ({
    position: 'absolute',
    left: horizontal ? `calc(50% + ${from}px)` : `calc(50% - ${thickness / 2}px)`,
    top: horizontal ? `calc(50% - ${thickness / 2}px)` : `calc(50% + ${from}px)`,
    width: horizontal ? to - from : thickness,
    height: horizontal ? thickness : to - from,
    background: '#050506',
  })
  const post = radius * 0.55
  return (
    <div style={full}>
      <div
        style={{
          ...full,
          background: `radial-gradient(circle at 50% 50%, transparent 0, transparent ${radius * 0.72}px, rgba(0,0,0,0.3) ${radius - 4}px, #000 ${radius}px, #000 100%)`,
        }}
      />
      {/* Fine centre lines, thick posts from the rim */}
      <div style={line(true, -post, post, 1.5)} />
      <div style={line(false, -post, post, 1.5)} />
      {[-1, 1].map((s) => (
        <div key={`h${s}`} style={line(true, s < 0 ? -radius : post, s < 0 ? -post : radius, 5)} />
      ))}
      {[-1, 1].map((s) => (
        <div key={`v${s}`} style={line(false, s < 0 ? -radius : post, s < 0 ? -post : radius, 5)} />
      ))}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: `calc(50% + ${radius * 0.78}px)`,
          transform: 'translateX(-50%)',
          font: HEAVY,
          fontSize: 14,
          color: 'rgba(255,255,255,0.85)',
          textShadow: shadow,
        }}
      >
        {magnification}x
      </div>
    </div>
  )
}

