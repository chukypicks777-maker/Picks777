// Calendar day of a fixture for the Hoy / Mañana filters, shared by server and browser.
// Providers publish fixtures without a confirmed time at a placeholder hour (ESPN:
// midnight Eastern, 04:00Z). Converting that instant to an American zone moved a
// Saturday fixture to Friday night, so such fixtures keep the provider's own date.
const formatters = new Map();
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

// Throws RangeError for an unknown IANA zone, which callers use as validation.
export function dayInZone(value, timeZone) {
  const key = timeZone === undefined ? 'local' : `zone:${timeZone}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', ...(timeZone === undefined ? {} : { timeZone }) });
    formatters.set(key, formatter);
  }
  return formatter.format(new Date(value));
}

export const easternDay = value => dayInZone(value, 'America/New_York');

// The provider date of a fixture whose start time is not confirmed, or null.
export function scheduleDay(match) {
  if (!match?.timeTBD) return null;
  if (ISO_DAY.test(match.scheduleDate || '')) return match.scheduleDate;
  return Number.isFinite(Date.parse(match.kickoff)) ? easternDay(match.kickoff) : null;
}

export function matchDayKey(match, timeZone) {
  const scheduled = scheduleDay(match);
  if (scheduled) return scheduled;
  return Number.isFinite(Date.parse(match?.kickoff)) ? dayInZone(match.kickoff, timeZone) : null;
}

// Today and tomorrow as YYYY-MM-DD in the viewer's zone (local when omitted).
export function dayKeys(now = new Date(), timeZone) {
  const today = dayInZone(now, timeZone);
  const [year, month, day] = today.split('-').map(Number);
  return { today, tomorrow: new Date(Date.UTC(year, month - 1, day + 1, 12)).toISOString().slice(0, 10) };
}
