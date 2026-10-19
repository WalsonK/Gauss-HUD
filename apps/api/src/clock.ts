/** Current time in ms; injected everywhere so tests control it. */
export type Now = () => number;

/** `YYYY-MM-DD` of `at` in `timeZone`: daily caps and usage reset at local midnight. */
export function localDay(at: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}
