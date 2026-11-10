export function round(value: number, places = 1): number {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function percentChange(last: number, current: number): number | null {
  return last === 0 ? null : ((current - last) / last) * 100;
}

export function share(part: number, total: number): number {
  return total === 0 ? 0 : (part / total) * 100;
}
