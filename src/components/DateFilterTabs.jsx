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
    { id: 'safe', label: 'Picks Banqueros (+85%)' },
    { id: 'btts', label: 'Ambos Anotan (BTTS)' },
    { id: 'over', label: '+2.5 Goles' },
    { id: 'corners', label: 'Línea de Córners' },
  ];

  return (
    <div className="w-full space-y-2.5 mb-5">
      
      {/* Top Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5">
        
        {/* Status Tabs */}
        <div className="flex items-center space-x-1 bg-[#121620] p-1 rounded-xl border border-white/[0.08] w-full sm:w-auto overflow-x-auto">
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
      <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 text-xs">
        <span className="text-[11px] font-mono text-slate-500 mr-1 shrink-0">Categoría:</span>
        {markets.map((m) => {
          const isSelected = marketFilter === m.id;
          return (
            <button
              key={m.id}
              onClick={() => {
                sounds.playClick();
                setMarketFilter(m.id);
              }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer whitespace-nowrap border shrink-0 ${
                isSelected
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 font-semibold'
                  : 'bg-[#121620] border-white/[0.06] text-slate-400 hover:text-slate-200 hover:border-white/15'
              }`}
            >
              {m.label}
            </button>
          );
        })}
      </div>

    </div>
  );
}
