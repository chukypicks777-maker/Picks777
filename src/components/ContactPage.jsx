import { useSocialLinks } from '../utils/socialSettings.js';
import { isStoreApp } from '../auth/platform.js';
export default function ContactPage() {
  const links = useSocialLinks();
  return <main className="max-w-xl mx-auto p-6 min-h-dvh space-y-5">
    <a href="/" className="inline-block py-3 text-sky-300">← Volver a 777 Picks</a>
    <h1 className="text-2xl font-bold">Contacto y privacidad</h1>
    <p>777 Picks es un proyecto independiente. Para soporte, privacidad o solicitudes sobre tus datos, escribe a <a href="mailto:chukypicks777@gmail.com" className="text-sky-300 underline">chukypicks777@gmail.com</a>.</p>
    {!isStoreApp() && <><p>También puedes contactar con los administradores de nuestras comunidades. No publiques contraseñas, códigos de acceso ni datos personales en los grupos.</p>
    <div className="flex flex-col gap-3">{links.map(link => <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-white/20 p-4 text-sky-300">{link.name} · {link.label}</a>)}</div></>}
    <p>También puedes <a href="/eliminar-cuenta" className="text-sky-300 underline">eliminar tu cuenta</a> desde la aplicación.</p>
    <a href="/privacidad.html" className="inline-block py-3 text-sky-300">Política de privacidad</a>
  </main>;
}
