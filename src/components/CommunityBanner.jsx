import React, { useState } from 'react';
import { ExternalLink, X } from 'lucide-react';
import { TelegramIcon, WhatsAppIcon, InstagramIcon } from './SocialIcons';
import { useSocialLinks, getSocialLink } from '../utils/socialSettings';
import { sounds } from '../utils/audioEffects';

export default function CommunityBanner() {
  const SOCIAL_LINKS = useSocialLinks();
  const telegramLink = getSocialLink(SOCIAL_LINKS, 'telegram');
  const whatsappLink = getSocialLink(SOCIAL_LINKS, 'whatsapp');
  const instagramLink = getSocialLink(SOCIAL_LINKS, 'instagram');
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="w-full bg-gradient-to-r from-[#111726] via-[#161f33] to-[#111726] border border-white/10 rounded-2xl p-3.5 sm:p-4 mb-5 text-white shadow-lg">
      <div className="flex flex-col md:flex-row items-center justify-between gap-3">
        
        {/* Left message */}
        <div className="flex items-center space-x-3 text-center md:text-left">
          <img 
            src="/logo.jpg" 
            alt="777 Picks - Picks de Confianza" 
            className="w-10 h-10 rounded-full object-cover border-2 border-red-500/50 shrink-0 hidden sm:flex shadow-md"
          />
          <div>
            <h4 className="font-bold text-xs sm:text-sm font-sans flex items-center justify-center md:justify-start space-x-2">
              <span>¿Quieres acceso ilimitado?</span>
              <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded font-bold border border-emerald-500/30 uppercase">
                Código GRATIS
              </span>
            </h4>
            <p className="text-[11px] text-slate-300 font-sans">
              Únete a una de nuestras comunidades y reclama un código totalmente GRATIS.
            </p>
          </div>
        </div>

        {/* Right buttons */}
        <div className="flex items-center space-x-2 shrink-0">
          
          {/* Telegram */}
          <a
            href={telegramLink.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => sounds.playClick()}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#229ED9]/15 hover:bg-[#229ED9]/25 text-[#229ED9] border border-[#229ED9]/30 rounded-xl text-xs font-semibold transition group shadow-sm"
          >
            <TelegramIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Telegram</span>
            <ExternalLink className="w-3 h-3 text-[#229ED9]/70 group-hover:text-[#229ED9]" />
          </a>

          {/* WhatsApp */}
          <a
            href={whatsappLink.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => sounds.playClick()}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#25D366]/15 hover:bg-[#25D366]/25 text-[#25D366] border border-[#25D366]/30 rounded-xl text-xs font-semibold transition group shadow-sm"
          >
            <WhatsAppIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">WhatsApp</span>
            <ExternalLink className="w-3 h-3 text-[#25D366]/70 group-hover:text-[#25D366]" />
          </a>

          {/* Instagram */}
          <a
            href={instagramLink.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => sounds.playClick()}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#E1306C]/15 hover:bg-[#E1306C]/25 text-[#E1306C] border border-[#E1306C]/30 rounded-xl text-xs font-semibold transition group shadow-sm"
          >
            <InstagramIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Instagram</span>
            <ExternalLink className="w-3 h-3 text-[#E1306C]/70 group-hover:text-[#E1306C]" />
          </a>

          {/* Close button */}
          <button
            onClick={() => setDismissed(true)}
            className="p-1 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
            title="Ocultar"
          >
            <X className="w-4 h-4" />
          </button>

        </div>

      </div>
    </div>
  );
}
