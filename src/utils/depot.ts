import type { DepotSettings } from '../types'

export function getDepotName(depot: number, settings: DepotSettings): string {
  return depot === 1 ? settings.depot1Name : settings.depot2Name
}

export function isHeavyDepot(depot: number, heavyDepot: number): boolean {
  return depot === heavyDepot
}

export function getDepotWorkloadLabel(depot: number, settings: DepotSettings): string {
  return isHeavyDepot(depot, settings.heavyDepot) ? 'Pesado' : 'Liviano'
}
