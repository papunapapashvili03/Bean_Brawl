import { CarBody } from '../cars/Car'
import { buildCaravan } from '../cars/caravan'
import { buildCityBus } from '../cars/cityBus'
import { buildJetta } from '../cars/jetta'
import { CAR_SCALE } from '../cars/kit'
import { buildMustang } from '../cars/mustang'
import { buildPickup } from '../cars/pickup'
import { buildYugo } from '../cars/yugo'
import { Lamps, Palms, PowerLines, StartMarks, Trees } from '../maps/Scenery'
import { LAMPS, PALMS, PARKED, POLES, POLE_ENDS, SPAWNS, TEAM_COLOURS, TREES } from './layout'

// Suburb's props: the cars in the circle and the drive, street lamps, palms and trees, the power line along
// the north, and each team's painted start marks.

const BUILDS = { bus: buildCityBus, pickup: buildPickup, caravan: buildCaravan, jetta: buildJetta, yugo: buildYugo, mustang: buildMustang }
const TEAMS = [
  { at: SPAWNS.west, colour: TEAM_COLOURS.west },
  { at: SPAWNS.east, colour: TEAM_COLOURS.east },
]

export function Props() {
  return (
    <group>
      {PARKED.map((p, i) => (
        <CarBody key={i} build={BUILDS[p.model]} scale={CAR_SCALE} position={[p.at[0], 0, p.at[1]]} yaw={p.yaw} />
      ))}
      <Lamps at={LAMPS} />
      <Palms at={PALMS} />
      <Trees at={TREES} />
      <PowerLines poles={POLES} ends={POLE_ENDS} />
      <StartMarks teams={TEAMS} />
    </group>
  )
}
