import React, { useState, useEffect, useCallback } from 'react';
import { KeyRound, ArrowRight, AlertCircle, CheckCircle2, Crown, ExternalLink, X, Clock, ShieldCheck } from 'lucide-react';
import confetti from 'canvas-confetti';
import { sounds } from '../utils/audioEffects';
import { TelegramIcon, WhatsAppIcon, InstagramIcon } from './SocialIcons';
import { useSocialLinks } from '../utils/socialSettings';
import { loginWithRealGoogle } from '../utils/firebase';

function GoogleIcon({ className = "w-5 h-5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.15C3.27 21.36 7.34 24 12 24z"/>
      <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.26C.46 8.16 0 9.94 0 12s.46 3.84 1.26 5.42l4.02-3.15z"/>
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.27 2.64 1.26 6.58l4.02 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
    </svg>
  );
}

export default function AuthGateModal({ auth, onAuthenticated, onClose }) {
  const SOCIAL_LINKS = useSocialLinks();
  const [pendingAuth, setPendingAuth] = useState(null);
  const isTrialExpired = Boolean(auth?.trialExpired || pendingAuth?.trialExpired);
  const isAlreadyLoggedIn = Boolean(auth?.valid || auth?.user);
  
  // Step state: 'google' | 'code'
  const [step, setStep] = useState(() => {
    if (isTrialExpired) return 'code';
    if (isAlreadyLoggedIn) return 'code';
    return 'google';
  });

  const [currentUser, setCurrentUser] = useState(() => auth?.user || null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Google credential submission handler
  const handleGoogleCredential = useCallback(async (credential) => {
    setLoading(true);
    setError('');
    sounds.playRadarScan();

    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ credential })
      });
      const data = await res.json();

      if (data.success) {
        sounds.playSuccess();
        setCurrentUser(data.user);
        setPendingAuth(data);
        if (data.trialExpired) {
          setStep('code');
          setError('Tu período de prueba de 3 días ha vencido. Ingresa un código o clave VIP para reactivar tu acceso.');
          onAuthenticated?.(data);
        } else {
          setSuccessMsg(`¡Bienvenido, ${data.user?.name || 'Usuario'}! Cuenta de Google vinculada con éxito.`);
          confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 } });
          setStep('code'); // Move to Step 2: user can enter code or continue with 3-day trial
        }
      } else {
        sounds.playGlitchSound();
        setError(data.message || 'Error al autenticar con Google.');
      }
    } catch {
      setError('Error de conexión con el servidor.');
    } finally {
      setLoading(false);
    }
  }, [onAuthenticated]);

  // Real Google Sign-In via Firebase Popup (accounts.google.com)
  const handleRealGoogleLogin = async () => {
    setLoading(true);
    setError('');
    sounds.playRadarScan();

    try {
      const googleAuth = await loginWithRealGoogle();
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          credential: googleAuth.token,
          googleProfile: googleAuth.user
        })
      });
      const data = await res.json();

      if (data.success) {
        sounds.playSuccess();
        setCurrentUser(data.user);
        setPendingAuth(data);
        if (data.trialExpired) {
          setStep('code');
          setError('Tu período de prueba de 3 días ha vencido. Ingresa un código o clave VIP para reactivar tu acceso.');
          onAuthenticated?.(data);
        } else {
          setSuccessMsg(`¡Bienvenido, ${data.user?.name || 'Usuario'}! Cuenta de Google vinculada con éxito.`);
          confetti({ particleCount: 60, spread: 70, origin: { y: 0.6 } });
          setStep('code'); // Move to Step 2: user can enter code or continue with 3-day trial
        }
      } else {
        sounds.playGlitchSound();
        setError(data.message || 'Error al autenticar con Google en el servidor.');
      }
    } catch (err) {
      console.error('Firebase Google Auth error:', err);
      sounds.playGlitchSound();
      if (err?.code === 'auth/popup-closed-by-user') {
        setError('Inicio de sesión cancelado (se cerró la ventana de Google).');
      } else if (err?.code === 'auth/popup-blocked') {
        setError('Tu navegador bloqueó la ventana emergente de Google. Por favor permite popups en este sitio.');
      } else if (err?.code === 'auth/cancelled-popup-request') {
        setError('Solicitud cancelada. Por favor haz clic de nuevo.');
      } else if (err?.code === 'auth/unauthorized-domain') {
        setError('Dominio no autorizado en Firebase. Por favor ingresa desde el dominio oficial https://picks777.vercel.app (o agrega este enlace en los Dominios Autorizados de tu consola de Firebase).');
      } else {
        setError(err?.message || 'Error al abrir la ventana oficial de Google.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Initialize Google Identity Services (GIS)
  useEffect(() => {
    let isMounted = true;

    async function initGIS() {
      try {
        const res = await fetch('/api/auth/google-config');
        const data = await res.json();
        const clientId = data.clientId || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_CLIENT_ID);

        if (clientId && window.google?.accounts?.id && isMounted) {
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: async (response) => {
              if (response?.credential && isMounted) {
                await handleGoogleCredential(response.credential);
              }
            }
          });

          const container = document.getElementById('google-btn-rendered');
          if (container && isMounted) {
            window.google.accounts.id.renderButton(container, {
              theme: 'filled_black',
              size: 'large',
              text: 'continue_with',
              shape: 'pill',
              width: 300
            });
          }
        }
      } catch {}
    }

    initGIS();
    return () => { isMounted = false; };
  }, [step, handleGoogleCredential]);

  const handleCodeSubmit = async (e) => {
    e?.preventDefault();
    if (!code.trim()) {
      setError('Por favor escribe tu código o clave VIP.');
      sounds.playGlitchSound();
      return;
    }

    setLoading(true);
    setError('');
    setSuccessMsg('');
    sounds.playRadarScan();

    try {
      const res = await fetch('/api/auth/redeem-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ code: code.trim() })
      });
      const data = await res.json();

      if (data.success) {
        sounds.playSuccess();
        confetti({ particleCount: 80, spread: 80, origin: { y: 0.6 } });
        setSuccessMsg(data.message || '¡Clave VIP activada con éxito!');
        setTimeout(() => {
          onAuthenticated?.(data);
          onClose?.();
        }, 800);
      } else {
        sounds.playGlitchSound();
        setError(data.message || 'Código incorrecto o vencido. Verifica o solicita uno en nuestras comunidades.');
      }
    } catch {
      setError('Error al conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  const handleUseDemoCode = (demoCode) => {
    setCode(demoCode);
    sounds.playClick();
  };

  const handleContinueWithTrial = () => {
    sounds.playClick();
    const finalAuth = pendingAuth || auth;
    if (finalAuth) {
      onAuthenticated?.(finalAuth);
    }
    onClose?.();
  };

  const handleLogoutAndSwitch = async () => {
    sounds.playClick();
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } catch {}
    setCurrentUser(null);
    setPendingAuth(null);
    setStep('google');
    setError('');
    setSuccessMsg('');
    window.dispatchEvent(new Event('picks-session-expired'));
  };

  const canCloseModal = Boolean(onClose && (auth?.valid || pendingAuth?.valid) && !isTrialExpired);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/90 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-lg bg-[#0d1117] border border-white/10 rounded-2xl p-6 sm:p-8 text-center shadow-2xl overflow-hidden my-4">
        
        {/* Close button (only when access is valid and modal is dismissible) */}
        {canCloseModal && (
          <button
            type="button"
            onClick={() => { sounds.playClick(); onClose(); }}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer z-10"
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* 777 Picks Circular Logo */}
        <div className="relative w-20 h-20 sm:w-24 sm:h-24 mx-auto mb-3">
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
          Picks de Confianza • Plataforma Cuantitativa de Apuestas Deportivas
        </p>

        {/* Status Indicator */}
        {isTrialExpired ? (
          <div className="flex items-center justify-center space-x-2 py-2 px-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-mono font-bold uppercase tracking-wider mb-5">
            <Clock className="w-4 h-4 text-rose-400 shrink-0" />
            <span>Período de Prueba de 3 Días Vencido</span>
          </div>
        ) : step === 'google' ? (
          <div className="flex items-center justify-center space-x-2 py-2 px-3 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400 text-xs font-mono font-bold uppercase tracking-wider mb-5">
            <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0" />
            <span>Paso 1: Registro Exclusivo con Google</span>
          </div>
        ) : (
          <div className="flex items-center justify-center space-x-2 py-2 px-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-bold uppercase tracking-wider mb-5">
            <KeyRound className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Paso 2: Canjear Clave VIP (Opcional)</span>
          </div>
        )}

        {/* Feedback Messages */}
        {error && (
          <div className="flex items-center space-x-2 text-rose-300 bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-xl text-xs font-sans mb-4 text-left">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="flex items-center space-x-2 text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-xl text-xs font-sans mb-4 text-left">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* STEP 1: GOOGLE REGISTRATION */}
        {step === 'google' && (
          <div className="space-y-4">
            <div className="bg-[#161b22] border border-white/5 rounded-xl p-4 text-left">
              <p className="text-xs sm:text-sm text-slate-200 font-sans leading-relaxed mb-2">
                Para acceder a los picks diarios, análisis cuantitativos e inteligencia artificial deportiva, ingresa con tu cuenta oficial de Google.
              </p>
              <div className="flex items-center space-x-2 text-emerald-400 text-xs font-mono font-bold">
                <Clock className="w-3.5 h-3.5" />
                <span>¡Incluye 3 días de acceso libre total garantizado!</span>
              </div>
            </div>

            {/* Official Google Button (Real Google OAuth Popup) */}
            <div className="py-2">
              <button
                type="button"
                onClick={handleRealGoogleLogin}
                disabled={loading}
                className="w-full py-3.5 px-4 bg-white hover:bg-slate-100 text-slate-900 rounded-xl font-bold text-sm sm:text-base flex items-center justify-center space-x-3 shadow-xl shadow-white/10 transition active:scale-[0.99] cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <GoogleIcon className="w-5 h-5 shrink-0" />
                    <span>Continuar con Google</span>
                  </>
                )}
              </button>
            </div>

            {/* Google Identity Services container if active */}
            <div id="google-btn-rendered" className="flex justify-center" />

            <div className="flex items-center justify-center space-x-2 text-[11px] text-slate-400 font-sans pt-1">
              <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
              <span>Autenticación oficial y segura con tu cuenta de Google</span>
            </div>
          </div>
        )}

        {/* STEP 2: VIP CODE REDEMPTION & TRIAL OPTIONS */}
        {step === 'code' && (
          <div className="space-y-4 text-left">
            
            {/* User identification badge */}
            {currentUser && (
              <div className="flex items-center space-x-3 bg-[#161b22] border border-white/10 rounded-xl p-3">
                {currentUser.picture ? (
                  <img
                    src={currentUser.picture}
                    alt={currentUser.name}
                    className="w-10 h-10 rounded-full object-cover border border-emerald-500/50"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-sm">
                    {currentUser.name?.charAt(0) || 'G'}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-bold text-white block truncate">{currentUser.name}</span>
                  <span className="text-[11px] text-slate-400 font-mono block truncate">{currentUser.email}</span>
                </div>
                <div className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                  isTrialExpired ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                }`}>
                  {isTrialExpired ? 'Vencido' : '3 Días Activos'}
                </div>
              </div>
            )}

            {/* Explanatory text */}
            <p className="text-xs text-slate-300 font-sans leading-relaxed">
              {isTrialExpired ? (
                <span className="text-rose-300 font-semibold">
                  Tu período de 3 días ha vencido. Para seguir utilizando todas las herramientas y pronósticos, ingresa una clave de membresía válida:
                </span>
              ) : (
                <span>
                  ¿Tienes una clave o código VIP? Ingrésalo ahora para activar membresía extendida o beneficios exclusivos.
                </span>
              )}
            </p>

            {/* VIP Code Form */}
            <form onSubmit={handleCodeSubmit} className="space-y-3">
              <div>
                <label className="block text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1 font-semibold">
                  Clave o Código VIP
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
                    placeholder="Ingresa tu código de acceso"
                    className="w-full pl-10 pr-4 py-2.5 bg-[#161b22] border border-white/10 rounded-xl text-sm font-mono font-bold text-emerald-400 placeholder:text-slate-500 tracking-wider focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl font-bold text-xs tracking-wider uppercase transition flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50 shadow-lg bg-emerald-500 hover:bg-emerald-400 text-black shadow-emerald-500/20"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>{isTrialExpired ? 'Reactivar Acceso con Clave' : 'Canjear Clave VIP'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Option to continue with 3-day trial without entering code */}
            {!isTrialExpired && (
              <button
                type="button"
                onClick={handleContinueWithTrial}
                className="w-full py-2.5 px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-mono text-slate-300 hover:text-white transition flex items-center justify-center space-x-2 cursor-pointer"
              >
                <span>Continuar con mi Prueba Gratuita (3 Días)</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              </button>
            )}

            {/* Quick test code buttons */}
            <div className="pt-2 border-t border-white/5 flex items-center justify-center space-x-2">
              <span className="text-[11px] text-slate-500 font-sans">Accesos rápidos:</span>
              <button
                type="button"
                onClick={() => handleUseDemoCode('DeportePicks')}
                className="text-[11px] font-mono text-amber-400 hover:text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded cursor-pointer transition flex items-center space-x-1"
              >
                <Crown className="w-3 h-3" />
                <span>Owner</span>
              </button>
            </div>

            {/* Option to switch Google account */}
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={handleLogoutAndSwitch}
                className="text-[11px] font-mono text-slate-400 hover:text-slate-200 transition cursor-pointer underline"
              >
                {isTrialExpired ? '← Cerrar sesión o cambiar de cuenta Google' : '← Cambiar de cuenta Google'}
              </button>
            </div>

          </div>
        )}

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
