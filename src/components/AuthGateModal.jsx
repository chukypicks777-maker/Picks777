import React, { useState } from 'react';
import { KeyRound, User, ArrowRight, AlertCircle, CheckCircle2, Crown, ExternalLink, X } from 'lucide-react';
import confetti from 'canvas-confetti';
import { sounds } from '../utils/audioEffects';
import { TelegramIcon, WhatsAppIcon, InstagramIcon } from './SocialIcons';
import { SOCIAL_LINKS } from '../constants/socials';

export default function AuthGateModal({ onAuthenticated, onClose }) {
  const [username, setUsername] = useState(() => {
    return localStorage.getItem('deportepicks_user_name') || '';
  });
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!username.trim()) {
      setError('Por favor escribe tu nombre o alias para continuar.');
      sounds.playGlitchSound();
      return;
    }

    if (!code.trim()) {
      setError('Por favor escribe tu código de acceso VIP. Si no tienes uno, únete a nuestras comunidades abajo para reclamarlo GRATIS.');
      sounds.playGlitchSound();
      return;
    }

    setLoading(true);
    setError('');
    setSuccessMsg('');
    sounds.playRadarScan();

    try {
      const res = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          code: code.trim(),
          username: username.trim()
        })
      });
      const data = await res.json();

      if (data.success) {
        sounds.playSuccess();
        localStorage.setItem('deportepicks_user_name', username.trim());
        confetti({
          particleCount: 60,
          spread: 70,
          origin: { y: 0.6 }
        });
        setSuccessMsg(data.message || `¡Bienvenido, ${username.trim()}! Acceso VIP concedido.`);
        setTimeout(() => {
          onAuthenticated(data);
        }, 800);
      } else {
        sounds.playGlitchSound();
        setError(data.message || 'Código incorrecto o vencido. Por favor ingresa un código válido o únete a nuestras comunidades para obtener uno GRATIS.');
      }
    } catch {
      setError('Error al conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  const handleUseDemo = (demoCode, demoName = '') => {
    setCode(demoCode);
    if (demoName) setUsername(demoName);
    sounds.playClick();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      
      <div className="relative w-full max-w-lg bg-[#0d1117] border border-white/10 rounded-2xl p-6 sm:p-8 text-center shadow-2xl overflow-hidden my-4">
        
        {onClose && (
          <button
            type="button"
            onClick={() => { sounds.playClick(); onClose(); }}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer z-10"
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Official 777 Picks Circular Logo */}
        <div className="relative w-24 h-24 mx-auto mb-3">
          <img 
            src="/logo.jpg" 
            alt="777 Picks - Picks de Confianza" 
            className="w-full h-full rounded-full object-cover border-2 border-red-500/60 shadow-xl"
          />
          <div className="absolute -bottom-1 -right-1 px-2 py-0.5 rounded-full bg-red-600 text-white font-mono text-[9px] font-black uppercase tracking-wider border border-black shadow">
            VIP
          </div>
        </div>

        {/* Brand Header */}
        <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-1 font-sans">
          777 <span className="text-red-500">PICKS</span>
        </h2>
        <p className="text-xs text-slate-400 mb-4 font-sans max-w-sm mx-auto">
          Picks de Confianza • Acceso exclusivo para miembros con código VIP verificado.
        </p>

        {/* VIP Lock Status Indicator */}
        <div className="flex items-center justify-center space-x-2 py-2 px-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono font-bold uppercase tracking-wider mb-5">
          <KeyRound className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Acceso Protegido por Código VIP</span>
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5 text-left">
          
          {/* 1. Username field */}
          <div>
            <label className="block text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1 font-semibold">
              Tu Nombre o Alias
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <User className="w-4 h-4 text-slate-400" />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError('');
                }}
                placeholder="Ej: Carlos Picks, ApuestaPro, Gael"
                className="w-full pl-10 pr-4 py-2.5 bg-[#161b22] border border-white/10 rounded-xl text-sm font-sans text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
              />
            </div>
          </div>

          {/* 2. Access Code field */}
          <div>
            <label className="block text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1 font-semibold">
              Código de Acceso VIP
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <KeyRound className="w-4 h-4 text-emerald-400" />
              </div>
              <input
                type="text"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  setError('');
                }}
                placeholder="EJ: VIP-PREMIUM-777 O DEPORTEPICKS"
                className="w-full pl-10 pr-4 py-2.5 bg-[#161b22] border border-white/10 rounded-xl text-sm font-mono font-bold text-emerald-400 placeholder:text-slate-500 tracking-wider focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center space-x-2 text-rose-300 bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-xl text-xs font-sans">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="flex items-center space-x-2 text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-xl text-xs font-sans">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl font-bold text-xs tracking-wider uppercase transition flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50 shadow-lg bg-emerald-500 hover:bg-emerald-400 text-black shadow-emerald-500/20"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>Desbloquear con Código VIP</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Demo shortcuts */}
        <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-center space-x-2">
          <span className="text-[11px] text-slate-500 font-sans">Accesos rápidos:</span>
          <button
            type="button"
            onClick={() => handleUseDemo('DeportePicks', 'Dueño DeportePicks')}
            className="text-[11px] font-mono text-amber-400 hover:text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded cursor-pointer transition flex items-center space-x-1"
          >
            <Crown className="w-3 h-3" />
            <span>Owner ("DeportePicks")</span>
          </button>
          <button
            type="button"
            onClick={() => handleUseDemo('VIP-PREMIUM-777', 'Usuario VIP')}
            className="text-[11px] font-mono text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded cursor-pointer transition"
          >
            VIP-PREMIUM-777
          </button>
        </div>

        {/* SOCIAL NETWORKS SECTION - REQUIRED EXACT TEXT */}
        <div className="mt-6 pt-5 border-t border-white/10 text-left">
          <div className="mb-3">
            <p className="text-xs sm:text-sm font-bold text-white font-sans leading-snug">
              ¿Quieres acceso ilimitado? Únete a una de nuestras comunidades y reclama un código totalmente GRATIS
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            
            {/* Telegram */}
            <a
              href={SOCIAL_LINKS[0].url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => sounds.playClick()}
              className="flex items-center justify-between p-2.5 bg-[#161b22] hover:bg-[#1f2633] border border-white/5 hover:border-sky-500/40 rounded-xl transition group text-left"
            >
              <div className="flex items-center space-x-2.5">
                <div className="w-7 h-7 rounded-lg bg-[#229ED9]/15 text-[#229ED9] flex items-center justify-center shrink-0">
                  <TelegramIcon className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-white block leading-tight">Telegram</span>
                  <span className="text-[10px] text-sky-400 font-mono">Free Picks</span>
                </div>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-white transition shrink-0" />
            </a>

            {/* WhatsApp */}
            <a
              href={SOCIAL_LINKS[1].url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => sounds.playClick()}
              className="flex items-center justify-between p-2.5 bg-[#161b22] hover:bg-[#1f2633] border border-white/5 hover:border-emerald-500/40 rounded-xl transition group text-left"
            >
              <div className="flex items-center space-x-2.5">
                <div className="w-7 h-7 rounded-lg bg-[#25D366]/15 text-[#25D366] flex items-center justify-center shrink-0">
                  <WhatsAppIcon className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-white block leading-tight">WhatsApp</span>
                  <span className="text-[10px] text-emerald-400 font-mono">Grupo VIP</span>
                </div>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-white transition shrink-0" />
            </a>

            {/* Instagram */}
            <a
              href={SOCIAL_LINKS[2].url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => sounds.playClick()}
              className="flex items-center justify-between p-2.5 bg-[#161b22] hover:bg-[#1f2633] border border-white/5 hover:border-pink-500/40 rounded-xl transition group text-left"
            >
              <div className="flex items-center space-x-2.5">
                <div className="w-7 h-7 rounded-lg bg-[#E1306C]/15 text-[#E1306C] flex items-center justify-center shrink-0">
                  <InstagramIcon className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-white block leading-tight">Instagram</span>
                  <span className="text-[10px] text-pink-400 font-mono">@picks__777</span>
                </div>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-white transition shrink-0" />
            </a>

          </div>
        </div>

      </div>
    </div>
  );
}
