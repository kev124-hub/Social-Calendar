import { format, parseISO } from 'date-fns'

/**
 * Converting a stored timestamp into the value an `<input type="datetime-local">`
 * or `<input type="date">` expects.
 *
 * Shared because two dialogs got this wrong in exactly the same way, and a third
 * would have too. `starts_at` / `scheduled_at` are `timestamptz` and arrive as
 * UTC ("2026-07-29T23:30:00+00:00"), while both input types are LOCAL by
 * definition. The obvious `iso.slice(0, 16)` therefore puts a UTC wall clock
 * into a field labelled local — and because saving reads that field back as
 * local, the value moved by the user's UTC offset on every save:
 *
 *   stored 2026-07-29T23:30Z  ->  7:30 PM in the app (UTC-4)
 *   prefilled "2026-07-29T23:30"  ->  saved as 2026-07-30T03:30Z  ->  11:30 PM
 *   open and save again  ->  3:30 AM, and so on
 *
 * Nothing had to be edited for it to happen: opening the dialog and pressing
 * Save was enough, and the form and the calendar agreed with each other
 * afterwards, so it looked like the user's own doing.
 *
 * Convert through the local calendar; never cut up the string.
 */
export function toDatetimeLocalInput(iso: string): string {
  return format(parseISO(iso), "yyyy-MM-dd'T'HH:mm")
}

/** As above, for `<input type="date">` (all-day events). */
export function toDateInput(iso: string): string {
  return format(parseISO(iso), 'yyyy-MM-dd')
}
