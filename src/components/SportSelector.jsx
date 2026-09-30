import React from 'react';
import { SPORTS } from '../constants/sports.js';

export default function SportSelector({ selectedSport, onSelect }) {
  const select = (index, focus = false) => {
    const sport = SPORTS[(index + SPORTS.length) % SPORTS.length];
    onSelect(sport.id);
    if (focus) document.getElementById(`sport-${sport.id}`)?.focus();
  };
  return (
    <div className="w-full bg-[#0d1117] border-b border-white/10">
      <nav role="tablist" aria-label="Deportes" className="grid grid-cols-4 gap-2 max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3">
        {SPORTS.map((sport, index) => (
          <button
            key={sport.id}
            id={`sport-${sport.id}`}
            type="button"
            role="tab"
            aria-selected={selectedSport === sport.id}
            aria-controls={`sport-panel-${sport.id}`}
            tabIndex={selectedSport === sport.id ? 0 : -1}
            onClick={() => select(index)}
            onKeyDown={event => {
              const target = event.key === 'ArrowRight' ? index + 1 : event.key === 'ArrowLeft' ? index - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? SPORTS.length - 1 : null;
              if (target !== null) { event.preventDefault(); select(target, true); }
            }}
            className={`min-w-0 min-h-14 rounded-xl border flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-1 py-2 text-[10px] sm:text-sm font-semibold transition cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 ${selectedSport === sport.id
              ? 'bg-red-500/15 border-red-400/60 text-white shadow-[0_0_16px_rgba(239,68,68,0.08)]'
              : 'bg-[#161b22] border-white/10 text-slate-400 hover:bg-white/5 hover:text-white'}`}
          >
            <span aria-hidden="true" className="text-xl sm:text-2xl leading-none">{sport.icon}</span>
            <span>{sport.name}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
