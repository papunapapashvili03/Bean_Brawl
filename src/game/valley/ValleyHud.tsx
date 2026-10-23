import { MapHud } from './MapHud'
import { StormHud } from './StormHud'

// Everything over Dust Bowl Valley's canvas: the map in the corner and the storm's clock, warnings and health
export function ValleyHud({ onRestart }: { onRestart: () => void }) {
  return (
    <>
      <MapHud />
      <StormHud onRestart={onRestart} />
    </>
  )
}
