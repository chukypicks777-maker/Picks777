import React from 'react';
import { sounds } from '../utils/audioEffects';
import { LEAGUES_DATA } from '../constants/leagues';

export default function LeagueSelector({ selectedLeague, onSelectLeague, matchCounts = {} }) {
  return (
    <div className="w-full py-2.5 mb-1 relative">
      <div className="flex items-center space-x-1.5 overflow-x-auto pb-1.5 px-0.5 pr-6 sm:pr-8 scrollbar-none no-scrollbar touch-pan-x">
        {LEAGUES_DATA.map((league) => {
          const isSelected = selectedLeague === league.id;
          const count = matchCounts[league.id] ?? (league.id === 'all' ? matchCounts.total : undefined);

          return (
            <button
              key={league.id}
              onClick={() => {
                sounds.playClick();
                onSelectLeague(league.id);
              }}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-150 cursor-pointer shrink-0 ${
                isSelected
                  ? 'bg-white text-slate-950 font-bold shadow-sm'
                  : 'bg-[#141923] text-slate-300 border border-white/[0.08] hover:border-white/20 hover:text-white hover:bg-[#1a2130]'
              }`}
            >
              <span className="text-sm leading-none">{league.flag}</span>
              <span className="font-sans">{league.name}</span>
              {count !== undefined && (
                <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-bold ${
                  isSelected ? 'bg-slate-900 text-white' : 'bg-white/10 text-slate-400'
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
        {/* End safety padding spacer so last league never clips on mobile */}
        <div className="w-3 shrink-0 pointer-events-none" aria-hidden="true" />
      </div>
    </div>
  );
}
