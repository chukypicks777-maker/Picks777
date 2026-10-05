export function formatMatchSchedule(kickoff, { timeTBD = false, timeZone } = {}) {
  if (kickoff == null || kickoff === '' || !Number.isFinite(Date.parse(kickoff))) return 'Fecha por confirmar';
  const date = new Date(kickoff);
  const day = date.toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short', ...(timeZone ? { timeZone } : {}) });
  const time = timeTBD ? 'Hora por confirmar' : date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', ...(timeZone ? { timeZone } : {}) });
  return `${day} · ${time}`;
}
