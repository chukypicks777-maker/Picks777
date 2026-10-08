import { scheduleDay } from './matchDay.js';
const formatters = new Map();
const providerDay = new Intl.DateTimeFormat('es', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
// scheduleDate: provider date (YYYY-MM-DD) of a fixture without a confirmed time.
// Its placeholder hour must not move it to another day in the viewer's zone.
export function formatMatchSchedule(kickoff, { timeTBD = false, timeZone, scheduleDate = null } = {}) {
  if (kickoff == null || kickoff === '' || !Number.isFinite(Date.parse(kickoff))) return 'Fecha por confirmar';
  const date = new Date(kickoff);
  const key = timeZone || 'local';
  if (!formatters.has(key)) formatters.set(key, {
    day: new Intl.DateTimeFormat('es', { weekday: 'short', day: 'numeric', month: 'short', ...(timeZone ? { timeZone } : {}) }),
    time: new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', ...(timeZone ? { timeZone } : {}) })
  });
  const formatter = formatters.get(key);
  const day = timeTBD && /^\d{4}-\d{2}-\d{2}$/.test(scheduleDate || '') ? providerDay.format(new Date(`${scheduleDate}T12:00:00Z`)) : formatter.day.format(date);
  const time = timeTBD ? 'Hora por confirmar' : formatter.time.format(date);
  return `${day} · ${time}`;
}
export const formatFixtureSchedule = (match, options = {}) => formatMatchSchedule(match?.kickoff, { ...options, timeTBD: Boolean(match?.timeTBD), scheduleDate: scheduleDay(match) });
