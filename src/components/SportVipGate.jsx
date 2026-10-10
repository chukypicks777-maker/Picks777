import React from 'react';
import { Lock, Crown } from 'lucide-react';
import { SPORTS } from '../constants/sports.js';
import { VipUnlockButton } from './VipLock';

// Non-VIP members cannot enter baseball, tennis or basketball: only the lock.
export default function SportVipGate({ sport, onUnlockVip }) {
  const info = SPORTS.find(item => item.id === sport);
  return <div role="tabpanel" id={`sport-panel-${sport}`} aria-labelledby={`sport-${sport}`} className="py-16 px-4 flex flex-col items-center text-center rounded-2xl border border-amber-500/35 bg-[#0d121c]">
    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/25 to-amber-600/10 border border-amber-500/40 flex items-center justify-center mb-4 shadow-[0_0_25px_rgba(245,158,11,0.3)]"><Lock className="w-8 h-8 text-amber-400" /></div>
    <p className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-mono font-bold mb-2"><Crown className="w-3 h-3 text-amber-400" />SOLO ACCESO VIP</p>
    <h2 className="text-lg font-bold text-white mb-1">{info?.icon} {info?.name} es exclusivo VIP</h2>
    <p className="text-xs text-slate-300 max-w-xs mb-4 leading-relaxed">Los pronósticos de béisbol, tenis y básquetbol están reservados para miembros VIP.</p>
    <VipUnlockButton onUnlockVip={onUnlockVip} />
  </div>;
}
