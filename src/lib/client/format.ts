const UNAVAILABLE = 'Not available';
const grouped = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 });
const money = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
function usable(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}
export function number(value: number | null | undefined): string {
  return usable(value) ? grouped.format(value).replace('-', '−') : UNAVAILABLE;
}
export function signedNumber(value: number | null | undefined): string {
  return usable(value)
    ? `${value > 0 ? '+' : ''}${number(value)}`
    : UNAVAILABLE;
}
export function currency(value: number | null | undefined): string {
  return usable(value)
    ? `${value < 0 ? '−' : ''}₹${money.format(Math.abs(value))}`
    : UNAVAILABLE;
}
export function percent(value: number | null | undefined): string {
  return usable(value)
    ? `${(value * 100).toFixed(1).replace('-', '−')}%`
    : UNAVAILABLE;
}
export function percentagePoints(value: number | null | undefined): string {
  return usable(value)
    ? `${value > 0 ? '+' : ''}${value.toFixed(1).replace('-', '−')} pp`
    : UNAVAILABLE;
}
export function date(value: string | null | undefined): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return UNAVAILABLE;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.valueOf())
    ? UNAVAILABLE
    : new Intl.DateTimeFormat('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(parsed);
}
export function milliseconds(value: number | null | undefined): string {
  return usable(value)
    ? `${Math.round(value).toLocaleString('en-IN')} ms`
    : UNAVAILABLE;
}
