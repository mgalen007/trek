export const DAY_MS = 24 * 60 * 60 * 1000;

// Calendar days (trip dates, hotel check-in/out) are stored as UTC midnight.
export const toDateOnly = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export const addDays = (d: Date, days: number) =>
  new Date(d.getTime() + days * DAY_MS);
