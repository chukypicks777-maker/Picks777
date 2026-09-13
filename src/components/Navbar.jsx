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
import { SOCIAL_LINKS } from '../constants/socials';

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
  onOpenUpgrade
}) {
  const [showSocialMenu, setShowSocialMenu] = useState(false);

  const userName = auth?.user?.name || auth?.user?.username || (auth?.isAdmin ? 'Owner' : 'Usuario VIP');
  const userInitial = userName.charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-40 w-full bg-[#0d1117] border-b border-white/10 shadow-md">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16">
          
          {/* Brand Wordmark & Identity */}
          <div 
            className="flex items-center space-x-2.5 cursor-pointer select-none" 
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            {/* Official 777 Picks Circular Logo */}
            <div className="relative">
              <img 
                src="/logo.jpg" 
                alt="777 Picks - Picks de Confianza" 
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover border border-red-500/40 shadow-sm"
              />
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[#0d1117]" />
            </div>

            <div>
              <div className="flex items-center space-x-1.5">
                <span className="font-black text-base sm:text-lg tracking-tight text-white font-sans">
                  777 <span className="text-red-500">PICKS</span>
                </span>
                <span className="bg-red-500/15 text-red-400 border border-red-500/30 text-[9px] font-mono font-bold px-1.5 py-0.2 rounded uppercase">
                  VIP
                </span>
              </div>
              <div className="flex items-center space-x-1 text-[10px] font-mono text-slate-400">
                <span className="text-slate-300 font-semibold">Picks de Confianza</span>
                <span className="text-slate-600">•</span>
                <span>8 Ligas</span>
              </div>
            </div>
          </div>

          {/* Center Navigation Links */}
          <nav className="hidden md:flex items-center space-x-1 bg-[#161b22] p-1 rounded-lg border border-white/5">
            <button
              onClick={() => { sounds.playClick(); window.scrollTo({ top: 320, behavior: 'smooth' }); }}
              className="px-3 py-1.5 rounded-md text-xs font-medium text-slate-300 hover:text-white hover:bg-white/5 transition flex items-center space-x-1.5 cursor-pointer"
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
          <div className="flex items-center space-x-1.5 sm:space-x-2">
            
            {/* SOCIAL NETWORKS DIRECT ACCESS (Desktop) */}
            <div className="hidden lg:flex items-center space-x-1 border-r border-white/10 pr-2 mr-0.5">
              {/* Telegram */}
              <a
                href={SOCIAL_LINKS[0].url}
                target="_blank"
                rel="noopener noreferrer"
                title="Canal de Telegram - Free Picks"
                onClick={() => sounds.playClick()}
                className="w-7 h-7 rounded-lg bg-[#161b22] hover:bg-[#229ED9]/20 text-slate-400 hover:text-[#229ED9] border border-white/5 hover:border-[#229ED9]/30 flex items-center justify-center transition"
              >
                <TelegramIcon className="w-3.5 h-3.5" />
              </a>

              {/* WhatsApp */}
              <a
                href={SOCIAL_LINKS[1].url}
                target="_blank"
                rel="noopener noreferrer"
                title="Grupo Oficial de WhatsApp"
                onClick={() => sounds.playClick()}
                className="w-7 h-7 rounded-lg bg-[#161b22] hover:bg-[#25D366]/20 text-slate-400 hover:text-[#25D366] border border-white/5 hover:border-[#25D366]/30 flex items-center justify-center transition"
              >
                <WhatsAppIcon className="w-3.5 h-3.5" />
              </a>

              {/* Instagram */}
              <a
                href={SOCIAL_LINKS[2].url}
                target="_blank"
                rel="noopener noreferrer"
                title="Instagram Oficial @picks__777"
                onClick={() => sounds.playClick()}
                className="w-7 h-7 rounded-lg bg-[#161b22] hover:bg-[#E1306C]/20 text-slate-400 hover:text-[#E1306C] border border-white/5 hover:border-[#E1306C]/30 flex items-center justify-center transition"
              >
                <InstagramIcon className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* Mobile Social Menu Dropdown Trigger */}
            <div className="relative lg:hidden">
              <button
                onClick={() => setShowSocialMenu(!showSocialMenu)}
                className="p-1.5 bg-[#161b22] border border-white/10 rounded-lg text-slate-300 hover:text-white transition"
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
              className={`p-1.5 sm:p-2 bg-[#161b22] border border-white/10 rounded-lg text-slate-400 hover:text-emerald-400 hover:border-emerald-500/40 transition cursor-pointer ${
                isSyncing ? 'text-emerald-400' : ''
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            </button>

            {/* Currency Selector */}
            <select
              value={currency}
              onChange={(e) => { sounds.playClick(); setCurrency(e.target.value); }}
              className="bg-[#161b22] text-[11px] font-mono text-slate-200 border border-white/10 rounded-lg px-2 py-1.5 focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="USD">USD ($)</option>
              <option value="MXN">MXN ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="COP">COP ($)</option>
              <option value="ARS">ARS ($)</option>
            </select>

            {/* Odds Format Selector */}
            <select
              value={oddsFormat}
              onChange={(e) => { sounds.playClick(); setOddsFormat(e.target.value); }}
              className="hidden sm:block bg-[#161b22] text-[11px] font-mono text-slate-200 border border-white/10 rounded-lg px-2 py-1.5 focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="decimal">Decimal</option>
              <option value="american">Americano</option>
              <option value="fractional">Fraccionario</option>
            </select>

            {/* Guest Upgrade Button */}
            {auth?.isGuest && (
              <button
                onClick={() => { sounds.playClick(); onOpenUpgrade?.(); }}
                className="hidden sm:flex items-center space-x-1 px-2.5 py-1 bg-gradient-to-r from-amber-500/20 to-emerald-500/20 hover:from-amber-500/30 hover:to-emerald-500/30 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-mono font-bold transition cursor-pointer"
                title="Activar Código VIP"
              >
                <Crown className="w-3 h-3 text-amber-400" />
                <span>Canjear VIP</span>
              </button>
            )}

            {/* User Profile Chip */}
            {auth && (
              <div className="flex items-center space-x-1.5 bg-[#161b22] border border-white/10 px-2 sm:px-2.5 py-1 rounded-lg text-xs font-sans">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] ${
                  auth.isAdmin ? 'bg-amber-500 text-black' : (auth.isGuest ? 'bg-slate-700 text-sky-300' : 'bg-emerald-500 text-black')
                }`}>
                  {auth.isAdmin ? <Crown className="w-3 h-3" /> : userInitial || <User className="w-3 h-3" />}
                </div>
                <span className="hidden sm:inline-block font-semibold text-slate-200 max-w-[90px] truncate text-[11px]">
                  {userName}
                </span>
                <span className={`text-[10px] font-mono font-bold ${
                  auth.isAdmin ? 'text-amber-400' : (auth.isGuest ? 'text-sky-400' : 'text-emerald-400')
                }`}>
                  {auth.isAdmin ? 'OWNER' : (auth.isGuest ? 'INVITADO' : `${auth.user?.daysRemaining || 30}d`)}
                </span>
              </div>
            )}

            {/* Logout */}
            <button
              onClick={() => { sounds.playClick(); onLogout(); }}
              title="Cerrar sesión"
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>

          </div>

        </div>
      </div>
    </header>
  );
}
