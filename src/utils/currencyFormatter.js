// Multi-currency Formatter & Conversion Utility

export const CURRENCIES = {
  USD: { code: 'USD', symbol: '$', name: 'Dólares (USD)', rateFromUSD: 1.0 },
  MXN: { code: 'MXN', symbol: '$', name: 'Pesos Mexicanos (MXN)', rateFromUSD: 18.5 },
  EUR: { code: 'EUR', symbol: '€', name: 'Euros (EUR)', rateFromUSD: 0.92 },
  COP: { code: 'COP', symbol: '$', name: 'Pesos Colombianos (COP)', rateFromUSD: 4100 },
  ARS: { code: 'ARS', symbol: '$', name: 'Pesos Argentinos (ARS)', rateFromUSD: 1250 }
};

// Each currency in its own country's format (MXN/USD 1,234.50; EUR 1.234,50).
const LOCALES = { USD: 'es-MX', MXN: 'es-MX', EUR: 'es-ES', COP: 'es-CO', ARS: 'es-AR' };
export function formatCurrency(amount, currencyCode = 'USD') {
  const num = parseFloat(amount) || 0;
  const curr = CURRENCIES[currencyCode] || CURRENCIES.USD;
  const locale = LOCALES[curr.code] || 'es-MX';

  if (currencyCode === 'COP' || currencyCode === 'ARS') {
    return `${curr.symbol} ${Math.round(num).toLocaleString(locale)}`;
  }

  return `${curr.symbol} ${num.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function convertFromUSD(amountInUSD, targetCurrency = 'USD') {
  const num = parseFloat(amountInUSD) || 0;
  const curr = CURRENCIES[targetCurrency] || CURRENCIES.USD;
  return num * curr.rateFromUSD;
}
