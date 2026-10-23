// Shield and health over a character's head, and the damage numbers that pop up there (see ./Bars)

export const MAX_HEALTH = 100
export const MAX_SHIELD = 100
export const BAR_HEIGHT = 2.45 // above the ground: clear of the head (its top is at about 1.92)
export const POPUP_TIME = 900 // ms

// A damage number: yellow for a headshot, blue when the shield took the hit, white for health
export type Popup = { id: number; value: number; kind: 'head' | 'shield' | 'health'; x: number }
