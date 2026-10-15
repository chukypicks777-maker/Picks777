import React, { useEffect, useState } from 'react';
import { RotateCw } from 'lucide-react';
import { watchAppVersion } from '../utils/appVersion.js';

// Shown when a newer version is published. The app also reloads by itself the
// next time the user returns to it (the parlay ticket survives the reload).
export default function UpdateBanner() {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (!import.meta.env.PROD) return undefined;
    return watchAppVersion(() => setAvailable(true));
  }, []);
  useEffect(() => {
    if (!available) return undefined;
    const reloadOnReturn = () => { if (document.visibilityState === 'visible') window.location.reload(); };
    document.addEventListener('visibilitychange', reloadOnReturn);
    return () => document.removeEventListener('visibilitychange', reloadOnReturn);
  }, [available]);
  if (!available) return null;
  return <div role="status" className="fixed top-2 left-1/2 -translate-x-1/2 z-[90] w-[calc(100%_-_1.5rem)] max-w-md rounded-xl border border-emerald-400/40 bg-[#0e1a14]/95 backdrop-blur px-3 py-2 shadow-lg flex items-center justify-between gap-3 text-xs text-emerald-100">
    <span>Hay una versión nueva de 777 Picks con datos y correcciones actualizados.</span>
    <button type="button" onClick={() => window.location.reload()} className="shrink-0 min-h-9 px-3 rounded-lg bg-emerald-500 text-black font-bold inline-flex items-center gap-1.5 cursor-pointer"><RotateCw size={13} />Actualizar</button>
  </div>;
}
