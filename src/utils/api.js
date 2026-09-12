export async function api(path, options = {}) {
  const response = await fetch(path, { ...options, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...options.headers } });
  let data;
  try { data = await response.json(); } catch { throw new Error('El servidor no devuelve una respuesta válida.'); }
  if (response.status === 401) window.dispatchEvent(new Event('picks-session-expired'));
  if (!response.ok || data.success === false) throw new Error(data.message || 'Servicio no disponible.');
  return data;
}
export const displayNumber = value => Number.isFinite(value) ? value.toLocaleString('es', { maximumFractionDigits: 1 }) : 'N/D';
export const percent = value => Number.isFinite(value) ? `${displayNumber(value)}%` : 'N/D';
export const dateTime = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' }) : 'N/D';
export function isFresh(match, now = Date.now()) {
  if (!match?.fetchedAt) return false;
  const age = now - Date.parse(match.fetchedAt);
  return Number.isFinite(age) && age >= -120000 && age < 600000;
}

