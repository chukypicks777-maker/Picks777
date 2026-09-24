import React from 'react';
import { Search, X, Radio, Clock, CheckCircle2, Calendar } from 'lucide-react';
import { sounds } from '../utils/audioEffects';

export default function DateFilterTabs({
  timeframe,
  setTimeframe,
  matchStatusFilter,
  setMatchStatusFilter,
  searchQuery,
  setSearchQuery,
  marketFilter,
  setMarketFilter,
  onNavigate,
  liveCount = 0
}) {
  const statusOptions = [
    { id: 'all', label: 'Todos', icon: <Calendar className="w-3.5 h-3.5" /> },
    { 
      id: 'LIVE', 
      label: 'En Vivo', 
      icon: <Radio className="w-3.5 h-3.5 text-rose-400" />,
      badge: liveCount > 0 ? liveCount : null,
      isLive: true
    },
    { id: 'today', label: 'Hoy', icon: <Clock className="w-3.5 h-3.5 text-sky-400" /> },
    { id: 'tomorrow', label: 'Mañana', icon: <Calendar className="w-3.5 h-3.5 text-slate-400" /> },
    { id: 'FINISHED', label: 'Resultados', icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> },
  ];

  const markets = [
    { id: 'all', label: 'Todos los Mercados' },
    { id: 'safe', label: '💎 Picks Banqueros (Más Seguros)' },
    { id: 'over', label: '+2.5 Goles (Over)' },
    { id: 'btts', label: 'Ambos Anotan (BTTS)' },
  ];

  return (
    <div className="w-full space-y-2.5 mb-5">
      
      {/* Top Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5">
        
        {/* Status Tabs */}
        <div className="flex items-center space-x-1 bg-[#121620] p-1 rounded-xl border border-white/[0.08] w-full sm:w-auto overflow-x-auto scrollbar-none no-scrollbar touch-pan-x pr-4 sm:pr-1">
          {statusOptions.map((opt) => {
            const isSelected = (opt.id === 'LIVE' || opt.id === 'FINISHED') 
              ? matchStatusFilter === opt.id 
              : (timeframe === opt.id && matchStatusFilter === 'all');

            return (
              <button
                key={opt.id}
                onClick={() => {
                  sounds.playClick();
                  if (opt.id === 'LIVE' || opt.id === 'FINISHED') {
                    setMatchStatusFilter(opt.id);
                    setTimeframe('all');
                  } else {
                    setMatchStatusFilter('all');
                    setTimeframe(opt.id);
                  }
                }}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                  isSelected
                    ? 'bg-white text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                {opt.icon}
                <span>{opt.label}</span>
                {opt.badge && (
                  <span className={`ml-1 px-1.5 py-0.2 font-mono font-bold text-[10px] rounded-full ${
                    isSelected ? 'bg-rose-600 text-white' : 'bg-rose-500 text-white'
                  }`}>
                    {opt.badge}
                  </span>
                )}
              </button>
            );
          })}
          <div className="w-2 shrink-0 pointer-events-none sm:hidden" aria-hidden="true" />
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
            <Search className="w-3.5 h-3.5" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar equipo o liga..."
            className="w-full pl-8 pr-7 py-1.5 bg-[#121620] border border-white/[0.08] rounded-xl text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-500 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

      </div>

      {/* Market Sub-Filters */}
      <div className="relative">
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 px-0.5 pr-6 sm:pr-2 text-xs scrollbar-none no-scrollbar touch-pan-x">
          <span className="text-[11px] font-mono text-slate-500 mr-1 shrink-0">Categoría:</span>
          {markets.map((m) => {
            const isSelected = marketFilter === m.id;
            return (
              <button
                key={m.id}
                onClick={() => {
                  sounds.playClick();
                  if (onNavigate) {
                    onNavigate(m.id);
                  } else {
                    setMarketFilter(m.id);
                  }
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer whitespace-nowrap border shrink-0 active:scale-95 ${
                  isSelected
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 font-semibold shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                    : 'bg-[#121620] border-white/[0.06] text-slate-400 hover:text-slate-200 hover:border-white/15'
                }`}
              >
                {m.label}
              </button>
            );
          })}
          <div className="w-3 shrink-0 pointer-events-none" aria-hidden="true" />
        </div>
        <div className="absolute right-0 top-0 bottom-1 w-5 bg-gradient-to-l from-[#080b11] via-[#080b11]/70 to-transparent pointer-events-none sm:hidden" aria-hidden="true" />
      </div>

    </div>
  );
}
