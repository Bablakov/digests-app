const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

/** Понедельник ISO-недели (UTC). */
function mondayOf(year: number, week: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dow = jan4.getUTCDay() || 7;
  const first = new Date(jan4.getTime() - (dow - 1) * 86400000);
  return new Date(first.getTime() + (week - 1) * 7 * 86400000);
}

/** «19–25 окт» или «28 окт – 3 ноя». */
export function weekRange(year: number, week: number): string {
  const a = mondayOf(year, week);
  const b = new Date(a.getTime() + 6 * 86400000);
  const [da, ma, db, mb] = [a.getUTCDate(), a.getUTCMonth(), b.getUTCDate(), b.getUTCMonth()];
  return ma === mb ? `${da}–${db} ${MONTHS[mb]}` : `${da} ${MONTHS[ma]} – ${db} ${MONTHS[mb]}`;
}
