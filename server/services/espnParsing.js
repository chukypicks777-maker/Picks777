// Shared ESPN value parsing. Kept separate so the team-stats aggregator and the
// feed parser can both use it without a circular import.
export const numberOrNull = value => {
  if (value === null || value === undefined || value === '') return null;
  const raw = typeof value === 'object' ? (value.value != null ? value.value : value.displayValue) : value;
  if (raw === null || raw === undefined || raw === '') return null;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
};

export function americanToDecimal(value) {
  const n = numberOrNull(value);
  return n && Math.abs(n) >= 100 ? (n > 0 ? 1 + n / 100 : 1 + 100 / Math.abs(n)) : null;
}
