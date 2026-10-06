const formatters = new Map();
export function formatMatchSchedule(kickoff, { timeTBD = false, timeZone } = {}) {
  if (kickoff == null || kickoff === '' || !Number.isFinite(Date.parse(kickoff))) return 'Fecha por confirmar';
  const date = new Date(kickoff);
  const key = timeZone || 'local';
  if (!formatters.has(key)) formatters.set(key, {
    day: new Intl.DateTimeFormat('es', { weekday: 'short', day: 'numeric', month: 'short', ...(timeZone ? { timeZone } : {}) }),
    time: new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', ...(timeZone ? { timeZone } : {}) })
  });
  const formatter = formatters.get(key);
  const day = formatter.day.format(date);
  const time = timeTBD ? 'Hora por confirmar' : formatter.time.format(date);
  return `${day} · ${time}`;
}
