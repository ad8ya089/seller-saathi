import { AppError } from '@/lib/errors';

export function calendarDate(today: Date, offsetDays = 0): string {
  if (!Number.isFinite(today.getTime()) || !Number.isSafeInteger(offsetDays))
    throw new AppError('INVALID_DATE', 'Invalid calendar date or day offset');
  const date = new Date(today.getTime());
  date.setUTCDate(date.getUTCDate() + offsetDays);
  if (!Number.isFinite(date.getTime()))
    throw new AppError('INVALID_DATE', 'Invalid calendar date offset');
  return date.toISOString().slice(0, 10);
}
