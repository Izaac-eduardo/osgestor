import type { MaintenanceDetail } from '../types/maintenance'

export function countMaintenanceLaunches(details: readonly MaintenanceDetail[] | null): number | null {
  return details === null ? null : details.length
}
