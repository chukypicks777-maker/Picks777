import React, { useEffect, useState } from 'react';

export default function InstallPage() {
  const [prompt, setPrompt] = useState(null);
  const [installed, setInstalled] = useState(() => typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true));
  useEffect(() => {
    const available = event => { event.preventDefault(); setPrompt(event); };
    const complete = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener('beforeinstallprompt', available);
    window.addEventListener('appinstalled', complete);
    return () => { window.removeEventListener('beforeinstallprompt', available); window.removeEventListener('appinstalled', complete); };
  }, []);
  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    setPrompt(null);
  };
  return <main className="max-w-2xl mx-auto p-5 sm:p-8 space-y-6 min-h-dvh">
    <a href="/" className="inline-block py-3 text-sky-300">← Volver a 777 Picks</a>
    <img src="/icons/icon-192.png" alt="777 Picks" width="80" height="80" className="rounded-2xl" />
    <h1 className="text-3xl font-bold">Instalar 777 Picks</h1>
    <p>Usa la web desde un navegador actualizado o añádela a tu pantalla de inicio. Necesitas conexión para iniciar sesión y consultar datos deportivos actuales.</p>
    {installed && <p role="status" className="text-emerald-300">Ya estás usando la aplicación instalada.</p>}
    {!installed && prompt && <button className="rounded-xl bg-emerald-700 px-5 py-3 font-bold" onClick={install}>Instalar en este dispositivo</button>}
    <section className="rounded-xl border border-white/20 p-5 space-y-3">
      <h2 className="text-xl font-bold">iPhone y iPad</h2>
      <ol className="list-decimal pl-5 space-y-2"><li>Abre picks777.vercel.app en Safari.</li><li>Pulsa Compartir y después Añadir a pantalla de inicio.</li><li>Si aparece «Abrir como app web», actívalo y pulsa Añadir.</li></ol>
      <p>Entra con la misma cuenta Google para recuperar tu VIP. Es una app web instalada desde Safari; el APK de Android no se instala en iPhone.</p>
    </section>
    <section className="rounded-xl border border-white/20 p-5 space-y-3">
      <h2 className="text-xl font-bold">Android y otros dispositivos</h2>
      <p>Abre el menú de Chrome o de tu navegador y selecciona Instalar aplicación o Añadir a pantalla de inicio, si está disponible. También puedes usar la web directamente.</p>
      <p>El propietario puede descargar el APK firmado desde Owner → Aplicación Android.</p>
      <p>El APK Android abre los partidos dentro de su propia ventana. Requiere Android 7 o posterior y Android System WebView 111 o posterior. La identificación con Google y los enlaces de comunidades se abren externamente al solicitarlos.</p>
    </section>
    <section className="space-y-2"><h2 className="text-xl font-bold">Acceso y actualizaciones</h2><p>Si Google no abre desde el navegador interno de una red social, abre esta dirección en Safari o Chrome y vuelve a pulsar Continuar con Google. Permite la ventana de acceso cuando el navegador lo solicite.</p><p>Las mejoras web llegan al abrir o recargar la aplicación con conexión. Las actualizaciones del APK se instalan desde el panel Owner.</p></section>
  </main>;
}
