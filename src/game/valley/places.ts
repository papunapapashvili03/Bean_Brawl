// Dust Bowl Valley's places (see ./layout): where each one stands, how much flat ground it gets and at what
// height. The terrain (./ground) is levelled under each; the buildings go on top (./sites).
//
// +x is east, +z south. The valley is about 550 x 500 m inside its ring of mountains.

export type Place = {
  id: string
  name: string
  x: number
  z: number
  r: number // flat ground round it (the terrain blends back to its own shape beyond)
  base: number // the height it's levelled to
  to?: [number, number] // levelled along a line from (x, z) to here instead of round a point (the runway)
  hot?: boolean // the best guns, the most exposed
}

// The mesa in the middle: a flat top 18 m up, cliffs all round
export const MESA = { x: 0, z: 0, top: 18, topR: 38, footR: 45 }

export const PLACES: Place[] = [
  { id: 'mesa', name: 'Lookout Mesa', x: 0, z: 0, r: 0, base: 18, hot: true },
  // The inner ring, along the highway round the mesa
  { id: 'dam', name: 'The Dam', x: 0, z: -125, r: 34, base: 0, hot: true },
  { id: 'junkyard', name: 'Junkyard', x: 92, z: -92, r: 32, base: 0 },
  { id: 'ghost', name: 'Ghost Town', x: 140, z: -22, r: 34, base: 0 },
  { id: 'drivein', name: 'Drive-in', x: 92, z: 92, r: 32, base: 0 },
  { id: 'suburb', name: 'Suburb', x: 0, z: 132, r: 32, base: 0 },
  { id: 'motel', name: 'Motel & Gas', x: -92, z: 92, r: 32, base: 0 },
  { id: 'farm', name: 'Farm', x: -132, z: 0, r: 34, base: 0 },
  { id: 'radio', name: 'Radio Tower', x: -92, z: -92, r: 30, base: 0 },
  // The outer ring, out towards the mountains
  { id: 'wind', name: 'Wind Ridge', x: 85, z: -182, r: 32, base: 12 },
  { id: 'gorge', name: 'Gorge Bridge', x: 215, z: -40, r: 0, base: 0 },
  { id: 'depot', name: 'Train Depot', x: 205, z: 78, r: 34, base: 0 },
  { id: 'oil', name: 'Oil Field', x: 88, z: 185, r: 34, base: 0 },
  { id: 'quarry', name: 'Quarry', x: -88, z: 185, r: 36, base: 0 },
  { id: 'airstrip', name: 'Airstrip', x: -222, z: -70, r: 36, base: 0, to: [-222, 50] },
  { id: 'ranch', name: 'Ranch', x: -160, z: -140, r: 32, base: 8 },
  { id: 'observatory', name: 'Observatory', x: -85, z: -185, r: 26, base: 16, hot: true },
]

export const placeById = (id: string) => PLACES.find((p) => p.id === id)!

// The reservoir behind the dam (its basin is levelled, then flooded a little)
export const RESERVOIR = { x: 0, z: -162, r: 30, floor: 5.5, water: 6.2 }

// The gorge's camps either side of the rope bridge, levelled at the rim
export const GORGE_CAMPS: { x: number; z: number; r: number }[] = [
  { x: 192, z: -40, r: 12 },
  { x: 239, z: -40, r: 11 },
]

// The quarry's pit
export const PIT = { x: -88, z: 185, r: 26, depth: 9 }
