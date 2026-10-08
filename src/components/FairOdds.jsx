import React from 'react';
import { formatOdds, marketQuote } from '../utils/oddsFormatter.js';

// Fair price of an estimated probability (100 / probability, no bookmaker margin).
export default function FairOdds({ probability, oddsFormat = 'decimal', className = '' }) {
  const quote = marketQuote(null, probability);
  return <span className={`font-mono text-[9.5px] text-sky-300 whitespace-nowrap ${className}`}>Momio justo {quote.kind === 'unavailable' ? 'N/D' : formatOdds(quote.odds, oddsFormat)}</span>;
}
