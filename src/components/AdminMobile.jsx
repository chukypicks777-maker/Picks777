import React, { useEffect, useState } from 'react';
import { api } from '../utils/api';

export default function AdminMobile() {
  const [release, setRelease] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    api('/api/admin/mobile').then(data => { if (active) setRelease(data); })
      .catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, []);
  return <section className="space-y-4 text-sm text-slate-300" aria-label="Aplicación Android">
    <h3 className="text-xl font-bold text-white">Instalar aplicación Android</h3>
    <a href="/instalar" className="inline-block py-2 text-sky-300 underline">Instalar en iPhone, iPad u otro dispositivo</a>
    <p>Abre este panel con tu cuenta owner desde Chrome en tu teléfono y descarga el APK firmado de prueba.</p>
    {error && <p role="alert" className="text-rose-300">{error}</p>}
    {!release && !error && <p role="status">Comprobando versión disponible…</p>}
    {release?.available ? <div className="rounded-xl border border-emerald-500/30 p-4 space-y-3">
      <p>Versión {release.versionName} · compilación {release.versionCode} · {(release.bytes / 1048576).toFixed(1)} MB</p>
      <a className="inline-block rounded-lg bg-emerald-600 px-4 py-3 font-bold text-white" href="/api/admin/mobile/apk">Descargar APK para instalar</a>
      <p className="text-xs break-all">SHA-256: {release.sha256}</p>
      <p>La aplicación abre {release.origin}. Los cambios web aparecen al recargar después de desplegarlos.</p>
    </div> : release && <p role="status" className="text-amber-300">{release.message}</p>}
    <ol className="list-decimal pl-5 space-y-2">
      <li>Descarga y abre el archivo. Si Android lo solicita, permite temporalmente instalar desde tu navegador.</li>
      <li>Instala la aplicación, inicia sesión y prueba navegación, informes y regreso desde Google.</li>
      <li>Para actualizar esta prueba instala el nuevo APK encima del anterior. Debe conservar la firma y aumentar el número de compilación.</li>
    </ol>
    <p className="text-xs text-slate-400">Las actualizaciones distribuidas por Google Play se instalan desde la tienda. Su firma puede ser distinta a la de esta prueba. La publicación sigue pendiente de la ficha, privacidad y revisión de Google.</p>
  </section>;
}
