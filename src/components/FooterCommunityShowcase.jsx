import React from 'react';
import { ExternalLink, Flame, Sparkles } from 'lucide-react';
import { TelegramIcon, WhatsAppIcon, InstagramIcon } from './SocialIcons';
import { SOCIAL_LINKS } from '../constants/socials';
import { sounds } from '../utils/audioEffects';

export default function FooterCommunityShowcase() {
  const tipsters = [
    "Gallitovip", "Japo7ime", "Rodrigopicks", "Abuelo", 
    "Cristian rey", "Gran islam", "Hugowx"
  ];

  return (
    <section className="w-full mt-14 mb-8">
      <div className="bg-gradient-to-b from-[#101624] to-[#0a0e17] border border-white/10 rounded-3xl p-5 sm:p-8 shadow-2xl overflow-hidden relative">
        
        {/* Subtle background glow */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-sky-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

        {/* Section Top Badge */}
        <div className="flex items-center justify-center sm:justify-start space-x-2 mb-3">
          <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-bold">
            <Flame className="w-3.5 h-3.5 text-emerald-400" />
            <span>CANAL #1 EN EFECTIVIDAD</span>
          </span>
          <span className="text-[11px] font-mono text-slate-400">
            Verificado • Mes Actual
          </span>
        </div>

        {/* Main Title Required by User */}
        <h2 className="text-xl sm:text-2xl md:text-3xl font-black text-white font-sans tracking-tight mb-6 text-center sm:text-left">
          ¡Este fue el canal con mayor efectividad del mes! 89% de efectividad. 📊
        </h2>

        {/* Grid: Promo Image + Detailed Info */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          
          {/* Left: The Reference Image with WhatsApp QR */}
          <div className="lg:col-span-5 flex justify-center">
            <a 
              href={SOCIAL_LINKS[1].url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => sounds.playClick()}
              className="relative group max-w-sm w-full rounded-2xl overflow-hidden border border-sky-500/30 shadow-[0_0_30px_rgba(14,165,233,0.15)] bg-[#0c121e] block cursor-pointer transition duration-300 hover:border-emerald-500/50 hover:shadow-[0_0_35px_rgba(16,185,129,0.25)]"
              title="Haz clic para unirte al Grupo Oficial de WhatsApp"
            >
              <img 
                src="/promo-tipsters.jpg" 
                alt="Filtramos las mejores apuestas de los 50 mejores tipsters del mundo" 
                className="w-full h-auto object-cover rounded-2xl transition duration-300 group-hover:scale-[1.02]"
              />
            </a>
          </div>

          {/* Right: Persuasive Copy & Social Networks */}
          <div className="lg:col-span-7 space-y-4 text-left">
            
            {/* Alert Box Required by User */}
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-rose-200">
              <p className="text-sm sm:text-base font-bold font-sans flex items-start space-x-2">
                <span>🚨 Deja de pagar Grupos VIPS, en estos grupos te pasamos los picks GRATIS de los mejores tipsters.</span>
              </p>
            </div>

            {/* Tipsters Callout */}
            <div className="p-4 rounded-2xl bg-[#141b29] border border-white/10 space-y-3">
              <div className="flex items-center space-x-1.5 text-xs font-mono text-amber-400 font-bold uppercase tracking-wider">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Tipsters Incluidos Diariamente:</span>
              </div>
              <p className="text-sm sm:text-base font-bold text-white font-sans leading-relaxed">
                Gallitovip, Japo7ime, Rodrigopicks, Abuelo, Cristian rey, Gran islam, Hugowx y muchos más..
              </p>
              
              {/* Tipster Chips */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {tipsters.map((t, idx) => (
                  <span 
                    key={idx} 
                    className="px-2.5 py-1 rounded-lg bg-[#1a2335] text-slate-200 text-xs font-sans font-medium border border-white/5"
                  >
                    ⭐ {t}
                  </span>
                ))}
                <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 text-xs font-mono font-bold border border-emerald-500/30">
                  + 43 Tipsters Élite
                </span>
              </div>
            </div>

            {/* Bombas & Escalera Bonus */}
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-200 flex items-center space-x-2.5">
              <span className="text-xl">🪜💣</span>
              <p className="text-xs sm:text-sm font-bold font-sans">
                ¡Te incluimos todas sus bombas y retos escalera de regalo!
              </p>
            </div>

            {/* Social Media Buttons Row */}
            <div className="pt-2">
              <p className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-2.5 font-semibold">
                Únete ahora a través de cualquiera de nuestros enlaces oficiales:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                
                {/* WhatsApp */}
                <a
                  href={SOCIAL_LINKS[1].url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => sounds.playClick()}
                  className="flex items-center justify-between p-3 bg-[#25D366]/15 hover:bg-[#25D366]/25 border border-[#25D366]/40 rounded-xl transition group shadow-md"
                >
                  <div className="flex items-center space-x-2.5">
                    <div className="w-8 h-8 rounded-lg bg-[#25D366] text-black flex items-center justify-center shrink-0">
                      <WhatsAppIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-white block">WhatsApp</span>
                      <span className="text-[10px] text-[#25D366] font-mono">Entrar al Grupo</span>
                    </div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-white transition" />
                </a>

                {/* Telegram */}
                <a
                  href={SOCIAL_LINKS[0].url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => sounds.playClick()}
                  className="flex items-center justify-between p-3 bg-[#229ED9]/15 hover:bg-[#229ED9]/25 border border-[#229ED9]/40 rounded-xl transition group shadow-md"
                >
                  <div className="flex items-center space-x-2.5">
                    <div className="w-8 h-8 rounded-lg bg-[#229ED9] text-white flex items-center justify-center shrink-0">
                      <TelegramIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-white block">Telegram</span>
                      <span className="text-[10px] text-sky-400 font-mono">Canal Free Picks</span>
                    </div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-white transition" />
                </a>

                {/* Instagram */}
                <a
                  href={SOCIAL_LINKS[2].url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => sounds.playClick()}
                  className="flex items-center justify-between p-3 bg-[#E1306C]/15 hover:bg-[#E1306C]/25 border border-[#E1306C]/40 rounded-xl transition group shadow-md"
                >
                  <div className="flex items-center space-x-2.5">
                    <div className="w-8 h-8 rounded-lg bg-[#E1306C] text-white flex items-center justify-center shrink-0">
                      <InstagramIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-white block">Instagram</span>
                      <span className="text-[10px] text-pink-400 font-mono">@picks__777</span>
                    </div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-white transition" />
                </a>

              </div>
            </div>

          </div>

        </div>

      </div>
    </section>
  );
}
