import React, { useState } from 'react';
import { 
  BarChart2, 
  Layers, 
  Crown, 
  LogOut, 
  Flame, 
  RefreshCw,
  User,
  Share2
} from 'lucide-react';
import { sounds } from '../utils/audioEffects';
import { TelegramIcon, WhatsAppIcon, InstagramIcon } from './SocialIcons';
import { useSocialLinks, getSocialLink } from '../utils/socialSettings';

export default function Navbar({ 
  auth, 
  onOpenAdmin, 
  onOpenStats, 
  onOpenParlay, 
  onLogout, 
  currency, 
  setCurrency, 
  oddsFormat, 
  setOddsFormat,
  parlayCount = 0,
  isSyncing = false,
  onManualSync,
  onOpenUpgrade,
  marketFilter = 'all',
  onNavigate
}) {
  const SOCIAL_LINKS = useSocialLinks();
  const telegramLink = getSocialLink(SOCIAL_LINKS, 'telegram');
  const whatsappLink = getSocialLink(SOCIAL_LINKS, 'whatsapp');
  const instagramLink = getSocialLink(SOCIAL_LINKS, 'instagram');
  const [showSocialMenu, setShowSocialMenu] = useState(false);

  const userName = auth?.user?.name || auth?.user?.username || (auth?.isAdmin ? 'Owner' : 'Usuario VIP');
  const userInitial = userName.charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-40 w-full bg-[#0d1117] border-b border-white/10 shadow-md">
      <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16">
          
          {/* Brand Wordmark & Identity */}
          <div 
            className="flex items-center space-x-1.5 sm:space-x-2.5 cursor-pointer select-none shrink min-w-0" 
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            {/* Official 777 Picks Circular Logo */}
            <div className="relative shrink-0">
              <img 
                src="/logo.jpg" 
                alt="777 Picks - Picks de Confianza" 
                className="w-7 h-7 sm:w-10 sm:h-10 rounded-full object-cover border border-red-500/40 shadow-sm"
              />
              <span className="absolute -bottom-0.5 -right-0.5 w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full bg-emerald-500 border-2 border-[#0d1117]" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center space-x-1 sm:space-x-1.5">
                <span className="font-black text-xs sm:text-base md:text-lg tracking-tight text-white font-sans whitespace-nowrap">
                  777 <span className="text-red-500">PICKS</span>
                </span>
                <span className="hidden min-[380px]:inline-block bg-red-500/15 text-red-400 border border-red-500/30 text-[8px] sm:text-[9px] font-mono font-bold px-1 sm:px-1.5 py-0.2 rounded uppercase shrink-0">
                  VIP
                </span>
              </div>
              <div className="hidden sm:flex items-center space-x-1 text-[9.5px] sm:text-[10px] font-mono text-slate-400 truncate">
                <span className="text-slate-300 font-semibold">Picks de Confianza</span>
                <span className="text-slate-600">•</span>
                <span>8 Ligas</span>
              </div>
            </div>
          </div>

          {/* Center Navigation Links */}
          <nav className="hidden md:flex items-center space-x-1 bg-[#161b22] p-1 rounded-lg border border-white/5">
            <button
              onClick={() => { sounds.playClick(); if (onNavigate) onNavigate('all'); window.scrollTo({ top: 320, behavior: 'smooth' }); }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition flex items-center space-x-1.5 cursor-pointer ${
                marketFilter === 'all'
                  ? 'bg-white/10 text-white font-semibold'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              <span>Partidos</span>
            </button>

            <button
              onClick={() => { sounds.playClick(); onOpenStats(); }}
              className="px-3 py-1.5 rounded-md text-xs font-medium text-slate-300 hover:text-white hover:bg-white/5 transition flex items-center space-x-1.5 cursor-pointer"
            >
              <BarChart2 className="w-3.5 h-3.5 text-sky-400" />
              <span>Estadísticas</span>
            </button>

            <button
              onClick={() => { sounds.playClick(); onOpenParlay(); }}
              className="relative px-3 py-1.5 rounded-md text-xs font-medium text-slate-300 hover:text-white hover:bg-white/5 transition flex items-center space-x-1.5 cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5 text-emerald-400" />
              <span>Parlay</span>
              {parlayCount > 0 && (
                <span className="ml-1 px-1.5 py-0.2 bg-emerald-500 text-black font-bold text-[10px] rounded-full">
                  {parlayCount}
                </span>
              )}
            </button>

            {auth?.isAdmin && (
              <button
                onClick={() => { sounds.playSuccess(); onOpenAdmin(); }}
                className="px-3 py-1.5 rounded-md text-xs font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 transition flex items-center space-x-1.5 cursor-pointer"
              >
                <Crown className="w-3.5 h-3.5 text-amber-400" />
                <span>Panel Owner</span>
              </button>
            )}
          </nav>

          {/* Right Controls: Social Networks, Profile, Settings & Logout */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            
            {/* SOCIAL NETWORKS DIRECT ACCESS (Desktop) */}
            <div className="hidden lg:flex items-center space-x-1 border-r border-white/10 pr-2 mr-0.5">
              {/* Telegram */}
              <a
                href={telegramLink.url}
                target="_blank"
                rel="noopener noreferrer"
                title={telegramLink.label || "Canal de Telegram - Free Picks"}
                onClick={() => sounds.playClick()}
                className="w-7 h-7 rounded-lg bg-[#161b22] hover:bg-[#229ED9]/20 text-slate-400 hover:text-[#229ED9] border border-white/5 hover:border-[#229ED9]/30 flex items-center justify-center transition"
              >
                <TelegramIcon className="w-3.5 h-3.5" />
              </a>

              {/* WhatsApp */}
              <a
                href={whatsappLink.url}
                target="_blank"
                rel="noopener noreferrer"
                title={whatsappLink.label || "Grupo Oficial de WhatsApp"}
                onClick={() => sounds.playClick()}
                className="w-7 h-7 rounded-lg bg-[#161b22] hover:bg-[#25D366]/20 text-slate-400 hover:text-[#25D366] border border-white/5 hover:border-[#25D366]/30 flex items-center justify-center transition"
              >
                <WhatsAppIcon className="w-3.5 h-3.5" />
              </a>

              {/* Instagram */}
              <a
                href={instagramLink.url}
                target="_blank"
                rel="noopener noreferrer"
                title={instagramLink.label || "Instagram Oficial @picks__777"}
                onClick={() => sounds.playClick()}
                className="w-7 h-7 rounded-lg bg-[#161b22] hover:bg-[#E1306C]/20 text-slate-400 hover:text-[#E1306C] border border-white/5 hover:border-[#E1306C]/30 flex items-center justify-center transition"
              >
                <InstagramIcon className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* Mobile Social Menu Dropdown Trigger */}
            <div className="relative hidden min-[360px]:block lg:hidden">
              <button
                onClick={() => setShowSocialMenu(!showSocialMenu)}
                className="p-1 sm:p-1.5 bg-[#161b22] border border-white/10 rounded-lg text-slate-300 hover:text-white transition active:scale-95 cursor-pointer"
                title="Comunidades Oficiales"
              >
                <Share2 className="w-3.5 h-3.5" />
              </button>

              {showSocialMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-[#161b22] border border-white/15 rounded-xl shadow-2xl p-2 z-50 space-y-1">
                  <span className="text-[10px] font-mono text-slate-400 px-2 uppercase tracking-wider block">
                    Comunidades Oficiales
                  </span>
                  {SOCIAL_LINKS.map(s => (
                    <a
                      key={s.id}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-200 hover:bg-white/5 transition"
                    >
                      {s.id === 'telegram' && <TelegramIcon className="w-3.5 h-3.5 text-[#229ED9]" />}
                      {s.id === 'whatsapp' && <WhatsAppIcon className="w-3.5 h-3.5 text-[#25D366]" />}
                      {s.id === 'instagram' && <InstagramIcon className="w-3.5 h-3.5 text-[#E1306C]" />}
                      <span>{s.name}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>

            {/* Real-time sync trigger */}
            <button
              onClick={() => { sounds.playClick(); onManualSync?.(); }}
              title="Sincronizar partidos en vivo"
              className={`hidden min-[350px]:block p-1 sm:p-2 bg-[#161b22] border border-white/10 rounded-lg text-slate-400 hover:text-emerald-400 hover:border-emerald-500/40 transition cursor-pointer shrink-0 active:scale-95 ${
                isSyncing ? 'text-emerald-400' : ''
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            </button>

            {/* Currency Selector */}
            <select
              value={currency}
              onChange={(e) => { sounds.playClick(); setCurrency(e.target.value); }}
              className="bg-[#161b22] text-[10px] sm:text-[11px] font-mono text-slate-200 border border-white/10 rounded-lg px-1 sm:px-2 py-1 sm:py-1.5 focus:outline-none focus:border-emerald-500 cursor-pointer shrink-0"
            >
              <option value="USD">USD</option>
              <option value="MXN">MXN</option>
              <option value="EUR">EUR</option>
              <option value="COP">COP</option>
              <option value="ARS">ARS</option>
            </select>

            {/* Odds Format Selector (Americano, Decimal, Fraccionario) */}
            <select
              aria-label="Formato de Momios"
              title="Formato de Momios / Cuotas"
              value={oddsFormat}
              onChange={(e) => { sounds.playClick(); setOddsFormat(e.target.value); }}
              className="bg-[#161b22] text-[10px] sm:text-[11px] font-mono text-slate-200 border border-white/10 rounded-lg px-1 sm:px-2 py-1 sm:py-1.5 focus:outline-none focus:border-emerald-500 cursor-pointer shrink-0"
            >
              <option value="american">Americano</option>
              <option value="decimal">Decimal</option>
              <option value="fractional">Fraccionario</option>
            </select>

            {/* Upgrade to VIP Button (for users on trial) */}
            {auth && !auth.isAdmin && !auth.user?.hasCode && (
              <button
                onClick={() => { sounds.playClick(); onOpenUpgrade?.(); }}
                className="hidden sm:flex items-center space-x-1 px-2.5 py-1 bg-gradient-to-r from-amber-500/20 to-emerald-500/20 hover:from-amber-500/30 hover:to-emerald-500/30 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-mono font-bold transition cursor-pointer shrink-0"
                title="Canjear Clave VIP"
              >
                <Crown className="w-3 h-3 text-amber-400" />
                <span>Canjear Clave</span>
              </button>
            )}

            {/* User Profile Chip */}
            {auth && (
              <div className="flex items-center space-x-1 sm:space-x-1.5 bg-[#161b22] border border-white/10 px-1 sm:px-2.5 py-1 rounded-lg text-xs font-sans shrink-0">
                {auth.user?.picture ? (
                  <img
                    src={auth.user.picture}
                    alt=""
                    className="w-4 h-4 sm:w-5 sm:h-5 rounded-full object-cover border border-emerald-500/40 shrink-0"
                  />
                ) : (
                  <div className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center font-bold text-[8px] sm:text-[10px] shrink-0 ${
                    auth.isAdmin ? 'bg-amber-500 text-black' : (auth.isTrial ? 'bg-sky-500 text-black' : 'bg-emerald-500 text-black')
                  }`}>
                    {auth.isAdmin ? <Crown className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> : userInitial || <User className="w-2.5 h-2.5 sm:w-3 sm:h-3" />}
                  </div>
                )}
                <span className="hidden sm:inline-block font-semibold text-slate-200 max-w-[80px] md:max-w-[100px] truncate text-[11px]">
                  {userName}
                </span>
                <span className={`text-[8px] sm:text-[10px] font-mono font-bold whitespace-nowrap ${
                  auth.isAdmin
                    ? 'text-amber-400'
                    : (auth.trialExpired
                      ? 'text-rose-400'
                      : (auth.user?.hasCode ? 'text-emerald-400' : 'text-sky-400'))
                }`}>
                  {auth.isAdmin
                    ? 'OWNER'
                    : (auth.trialExpired
                      ? 'EXP'
                      : (auth.user?.hasCode ? <>VIP<span className="hidden min-[380px]:inline"> {auth.user?.daysRemaining || 30}d</span></> : `${auth.user?.daysRemaining || 3}d`))}
                </span>
              </div>
            )}

            {/* Logout */}
            <button
              onClick={() => { sounds.playClick(); onLogout(); }}
              title="Cerrar sesión"
              className="p-1 sm:p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition cursor-pointer shrink-0 active:scale-95"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>

          </div>

        </div>
        <nav aria-label="Navegación móvil" className="flex md:hidden items-center justify-between gap-1 sm:gap-1.5 pb-2 pt-1 border-t border-white/5 overflow-x-auto scrollbar-none no-scrollbar">
          <button
            onClick={() => { sounds.playClick(); if (onNavigate) onNavigate('all'); window.scrollTo({ top: 320, behavior: 'smooth' }); }}
            className={`flex-1 min-w-0 py-2 px-1 rounded-lg font-medium transition text-center whitespace-nowrap text-[10.5px] sm:text-xs flex items-center justify-center active:scale-95 cursor-pointer ${
              marketFilter === 'all' ? 'bg-white/10 text-white font-bold border border-white/10' : 'bg-slate-800/80 text-slate-300'
            }`}
          >
            <span className="truncate">Partidos</span>
          </button>
          <button 
            onClick={() => { sounds.playClick(); onOpenStats(); }} 
            className="flex-1 min-w-0 py-2 px-1 rounded-lg bg-slate-800/80 text-sky-300 font-medium text-center whitespace-nowrap text-[10.5px] sm:text-xs flex items-center justify-center active:scale-95 cursor-pointer"
          >
            <span className="truncate">Stats</span>
          </button>
          <button 
            onClick={() => { sounds.playClick(); onOpenParlay(); }} 
            className="flex-1 min-w-0 py-2 px-1 rounded-lg bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 font-bold text-center whitespace-nowrap text-[10.5px] sm:text-xs flex items-center justify-center active:scale-95 cursor-pointer"
          >
            <span className="truncate">Parlay {parlayCount > 0 ? `(${parlayCount})` : ''}</span>
          </button>
          {auth?.isAdmin && (
            <button 
              onClick={() => { sounds.playSuccess(); onOpenAdmin(); }} 
              className="flex-1 min-w-0 py-2 px-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 font-bold text-center whitespace-nowrap text-[10.5px] sm:text-xs flex items-center justify-center active:scale-95 cursor-pointer"
            >
              <span className="truncate">👑 Owner</span>
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
