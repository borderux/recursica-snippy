// Displayed dates follow the house format - a three-letter month, the day,
// a four-digit year - built with Intl in the reader's own locale and time
// zone. No locale argument on purpose: passing one would name a locale the
// reader did not choose.
const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function formatDateTime(timestamp: number): string {
  return dateTimeFormat.format(new Date(timestamp));
}

// For the downloaded report, which is read later and possibly in another
// time zone: the same format, with the zone stated.
const dateTimeWithZoneFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

export function formatDateTimeWithZone(timestamp: number): string {
  return dateTimeWithZoneFormat.format(new Date(timestamp));
}

const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

// A time of day on its own, for "saved at" - the date is always today.
export function formatTime(timestamp: number): string {
  return timeFormat.format(new Date(timestamp));
}

// Counts group their digits from four figures up (2,046, not 2046).
const countFormat = new Intl.NumberFormat();

export function formatCount(n: number): string {
  return countFormat.format(n);
}

export function plural(n: number, one: string, many: string): string {
  return `${formatCount(n)} ${n === 1 ? one : many}`;
}
