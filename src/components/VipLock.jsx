import React from 'react';
import { Lock, Crown, Sparkles } from 'lucide-react';
import { isStoreApp } from '../auth/platform.js';
import { sounds } from '../utils/audioEffects';

export function VipUnlockButton({ onUnlockVip, className = '' }) {
  return <button type="button" onClick={event => { event.stopPropagation(); sounds?.playClick?.(); onUnlockVip?.(); }}
    className={`min-h-9 px-3.5 py-1.5 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-bold font-mono text-[11px] rounded-lg shadow-[0_0_15px_rgba(245,158,11,0.35)] transition cursor-pointer inline-flex items-center gap-1 ${className}`}>
    <Sparkles className="w-3.5 h-3.5 text-slate-950" />{isStoreApp() ? 'Mi acceso' : 'Desbloquear con VIP'}
  </button>;
}

export function VipBadge() {
  return <span className="inline-flex items-center gap-1 font-mono font-bold text-amber-300"><Lock size={10} />VIP</span>;
}

// Same treatment as the football VIP markets: the section stays in place but
// blurred, with the unlock action on top.
export default function VipLock({ locked, title, description = 'Desbloquea estas probabilidades y momios con tu Pase VIP.', onUnlockVip, children }) {
  if (!locked) return children;
  return <div className="relative rounded-xl overflow-hidden min-h-[200px]">
    <div aria-hidden="true" inert className="filter blur-[5px] select-none pointer-events-none opacity-25">{children}</div>
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-4 text-center bg-[#090d16]/85 backdrop-blur-[2px] rounded-xl border border-amber-500/35">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/25 to-amber-600/10 border border-amber-500/40 flex items-center justify-center mb-2"><Lock className="w-5 h-5 text-amber-400" /></div>
      <p className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-mono font-bold mb-1.5"><Crown className="w-3 h-3 text-amber-400" />SOLO ACCESO VIP</p>
      <h3 className="text-xs sm:text-sm font-bold text-white mb-1">{title}</h3>
      <p className="text-[10px] sm:text-[11px] text-slate-300 max-w-[240px] mb-3 leading-tight">{description}</p>
      <VipUnlockButton onUnlockVip={onUnlockVip} />
    </div>
  </div>;
}
