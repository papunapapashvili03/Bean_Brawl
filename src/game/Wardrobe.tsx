import { useState, type MouseEvent } from 'react'
import { FLAGS, type FlagId } from './flags'
import { SHADE_COLORS, setOutfit, useOutfit, type Outfit } from './outfit'

type Option<K extends keyof Outfit> = { value: Outfit[K]; label: string; swatch?: string }

const HATS: Option<'hat'>[] = [
  { value: 'none', label: 'None' },
  { value: 'cap', label: 'Cap' },
  { value: 'topHat', label: 'Top hat' },
  { value: 'hardHat', label: 'Safety helmet' },
  { value: 'combatHelmet', label: 'Military helmet' },
]
const FACES: Option<'face'>[] = [
  { value: 'none', label: 'None' },
  { value: 'medical', label: 'Medical mask' },
  { value: 'fullMask', label: 'Full face mask' },
]
const SHADES: Option<'shades'>[] = [
  { value: 'none', label: 'None' },
  ...(Object.keys(SHADE_COLORS) as (keyof typeof SHADE_COLORS)[]).map((c) => ({
    value: c,
    label: c[0].toUpperCase() + c.slice(1),
    swatch: SHADE_COLORS[c],
  })),
]
const BACKS: Option<'back'>[] = [
  { value: 'none', label: 'None' },
  { value: 'backpack', label: 'Backpack' },
  { value: 'military', label: 'Military pack' },
]
const FLAG_OPTIONS: Option<'flag'>[] = [
  { value: 'none', label: 'None' },
  ...(Object.keys(FLAGS) as FlagId[]).map((id) => ({ value: id, label: FLAGS[id] })),
]

// Buttons give focus back to the game right away, so WASD / Space keep working after a click
const blur = (e: MouseEvent<HTMLButtonElement>) => e.currentTarget.blur()

function Slot<K extends keyof Outfit>({ slot, title, options }: { slot: K; title: string; options: Option<K>[] }) {
  const outfit = useOutfit()
  return (
    <div className="wardrobe-slot">
      <div className="wardrobe-slot-title">{title}</div>
      <div className="wardrobe-options">
        {options.map((o) => (
          <button
            key={o.value}
            className={outfit[slot] === o.value ? 'active' : ''}
            aria-pressed={outfit[slot] === o.value}
            onClick={(e) => {
              blur(e)
              setOutfit({ [slot]: o.value } as Partial<Outfit>)
            }}
          >
            {o.swatch && <span className="wardrobe-swatch" style={{ background: o.swatch }} />}
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Wardrobe() {
  const [open, setOpen] = useState(false)
  const { back } = useOutfit()
  return (
    <div className="wardrobe">
      {open && (
        <div className="wardrobe-panel" role="dialog" aria-label="Wardrobe">
          <Slot slot="hat" title="Hat" options={HATS} />
          <Slot slot="face" title="Face" options={FACES} />
          <Slot slot="shades" title="Sunglasses" options={SHADES} />
          <Slot slot="back" title="Back" options={BACKS} />
          {back === 'military' && <Slot slot="flag" title="Flag patch" options={FLAG_OPTIONS} />}
        </div>
      )}
      <button
        className={`wardrobe-toggle${open ? ' active' : ''}`}
        aria-expanded={open}
        onClick={(e) => {
          blur(e)
          setOpen((v) => !v)
        }}
      >
        Wardrobe
      </button>
    </div>
  )
}
