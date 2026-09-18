import React from 'react';

// Keep displayed probabilities stable: animated intermediate values imply false data.
export default function NumberCounter({ value = null, decimals = 0, prefix = '', suffix = '' }) {
  if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return <span title="Sin datos suficientes">N/D</span>;
  const precision = Number.isFinite(decimals) ? Math.min(2, Math.max(0, Math.floor(decimals))) : 0;
  return <span className="tabular-numbers">{prefix}{Number(value).toFixed(precision)}{suffix}</span>;
}
