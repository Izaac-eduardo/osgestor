export function calculateWorkDurationMinutes(day: string, start: string, end: string): number {
  if (!day || !start || !end) return 0
  const startMinutes = Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5))
  const endMinutes = Number(end.slice(0, 2)) * 60 + Number(end.slice(3, 5))
  return Number.isFinite(startMinutes) && Number.isFinite(endMinutes) ? endMinutes - startMinutes : 0
}
