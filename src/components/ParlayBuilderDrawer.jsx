import React, { useState } from 'react';
import { 
  X, 
  Trash2, 
  Layers, 
  Copy, 
  Check, 
  AlertTriangle, 
  ChevronUp, 
  ChevronDown,
  TrendingUp,
  Sparkles
} from 'lucide-react';
import { formatOdds } from '../utils/oddsFormatter';
import { formatCurrency } from '../utils/currencyFormatter';
import { sounds } from '../utils/audioEffects';

export default function ParlayBuilderDrawer({ 
  isOpen, 
  onClose, 
  legs = [], 
  onRemoveLeg, 
  onClearAll, 
  onLoadDailyBanker, 
  currency = 'USD', 
  oddsFormat = 'decimal' 
}) {
  const [stake, setStake] = useState(50);
  const [copied, setCopied] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  let totalDecimalOdds = 1.0;
  legs.forEach(leg => {
    totalDecimalOdds *= (parseFloat(leg.odds) || 1.0);
  });
  totalDecimalOdds = parseFloat(totalDecimalOdds.toFixed(2));

  const potentialPayout = parseFloat((stake * totalDecimalOdds).toFixed(2));
  const netProfit = parseFloat((potentialPayout - stake).toFixed(2));

  const handleCopyTicket = () => {
    sounds.playClick();
    const summary = `🏆 DEPORTEPICKS PRO — TICKET DE PARLAY 🏆\n\n` +
      legs.map((l, i) => `${i + 1}. [${l.league}] ${l.matchTitle}\n   👉 Selección: ${l.selection} @ ${formatOdds(l.odds, oddsFormat)}`).join('\n\n') +
      `\n\n📊 Cuota Total: ${formatOdds(totalDecimalOdds, oddsFormat)}\n💰 Monto: ${formatCurrency(stake, currency)}\n💵 Retorno: ${formatCurrency(potentialPayout, currency)}\n⚠️ Todos los eventos deben cumplirse.`;

    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 w-full max-w-md animate-slide-up">
      <div className="bg-[#0e131d]/95 backdrop-blur-xl border border-sky-500/30 rounded-2xl overflow-hidden shadow-[0_10px_40px_rgba(0,0,0,0.8)]">
        
        {/* Drawer Header */}
        <div className="bg-[#121824] px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <img 
              src="/logo.jpg" 
              alt="777 Picks" 
              className="w-7 h-7 rounded-full object-cover border border-red-500/50 shrink-0"
            />
            <h4 className="font-bold text-xs text-white flex items-center space-x-1.5 font-sans">
              <span>Boleto 777 Picks</span>
              <span className="px-1.5 py-0.2 bg-red-500 text-white font-mono font-bold text-[10px] rounded">
                {legs.length}
              </span>
            </h4>
          </div>

          <div className="flex items-center space-x-1">
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/5 transition"
            >
              {isMinimized ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            <button
              onClick={() => { sounds.playClick(); onClose(); }}
              className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-white/5 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {!isMinimized && (
          <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto font-mono text-xs">
            
            {/* Quick 1-Click Banker Import */}
            <div className="flex items-center justify-between p-2.5 bg-[#141c2b] rounded-xl border border-sky-500/20 shadow-inner">
              <div className="flex items-center space-x-1.5 text-slate-300 font-sans">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[11px]">¿Cargar Parlay Banquero IA?</span>
              </div>
              <button
                onClick={() => {
                  sounds.playSuccess();
                  onLoadDailyBanker();
                }}
                className="px-2.5 py-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black font-bold text-[11px] rounded-lg transition cursor-pointer shadow-[0_0_10px_rgba(16,185,129,0.4)]"
              >
                Cargar Banquero
              </button>
            </div>

            {/* Legs List */}
            {legs.length === 0 ? (
              <div className="text-center py-6 border border-dashed border-white/10 rounded-xl bg-[#0b0f17]">
                <Layers className="w-6 h-6 text-slate-600 mx-auto mb-1.5" />
                <p className="text-[11px] text-slate-400 font-sans">
                  Ticket vacío. Haz clic en <strong>"+ Al Parlay"</strong> en cualquier partido.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {legs.map((leg, index) => (
                  <div
                    key={index}
                    className="p-2.5 bg-[#121824] rounded-lg border border-white/5 flex items-center justify-between transition hover:border-sky-500/30"
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <span className="text-[10px] text-sky-400 block truncate">
                        {leg.league} • {leg.matchTitle}
                      </span>
                      <p className="font-semibold text-xs text-white truncate font-sans">
                        {leg.selection}
                      </p>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      <span className="px-1.5 py-0.5 bg-[#182030] rounded text-[11px] font-bold text-emerald-400 border border-emerald-500/20">
                        {formatOdds(leg.odds, oddsFormat)}
                      </span>
                      <button
                        onClick={() => { sounds.playClick(); onRemoveLeg(index); }}
                        className="text-slate-500 hover:text-rose-400 p-1 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Warning */}
            <div className="flex items-start space-x-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-[10.5px] text-amber-300 font-sans">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400 mt-0.5" />
              <span>
                Regla Parlay: Si 1 sola selección falla, se pierde el ticket completo.
              </span>
            </div>

            {/* Calculation details */}
            {legs.length > 0 && (
              <div className="bg-[#121824] p-3.5 rounded-xl border border-sky-500/20 space-y-2.5 shadow-inner">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Multiplicador Cuota:</span>
                  <span className="text-base font-bold text-sky-400">
                    {formatOdds(totalDecimalOdds, oddsFormat)}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-white/5">
                  <span className="text-slate-400">Monto ({currency}):</span>
                  <input
                    type="number"
                    value={stake}
                    onChange={(e) => setStake(Math.max(1, parseFloat(e.target.value) || 0))}
                    className="w-24 px-2.5 py-1 bg-[#090d15] border border-sky-500/30 rounded-lg text-right font-bold text-white text-xs focus:outline-none focus:border-sky-400"
                  />
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-white/5">
                  <span className="text-emerald-400 font-semibold flex items-center space-x-1">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Retorno Potencial:</span>
                  </span>
                  <span className="text-base font-black text-emerald-400">
                    {formatCurrency(potentialPayout, currency)}
                  </span>
                </div>

                <div className="flex justify-between items-center text-[11px] text-slate-400 pt-1">
                  <span>Ganancia Neta:</span>
                  <span className="text-sky-300 font-bold">
                    +{formatCurrency(netProfit, currency)}
                  </span>
                </div>
              </div>
            )}

            {/* Buttons */}
            {legs.length > 0 && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={handleCopyTicket}
                  className="py-2.5 px-3 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 rounded-xl text-xs font-semibold transition flex items-center justify-center space-x-1 shadow-[0_0_15px_rgba(56,189,248,0.2)]"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? '¡Copiado!' : 'Copiar Ticket'}</span>
                </button>

                <button
                  onClick={() => { sounds.playClick(); onClearAll(); }}
                  className="py-2.5 px-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 rounded-xl text-xs font-semibold transition flex items-center justify-center space-x-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Vaciar</span>
                </button>
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  );
}
