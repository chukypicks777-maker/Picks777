import { useSocialLinks } from '../utils/socialSettings.js';
export default function ContactPage() {
  const links = useSocialLinks();
  return <main className="max-w-xl mx-auto p-6 min-h-dvh space-y-5">
    <a href="/" className="inline-block py-3 text-sky-300">← Volver a 777 Picks</a>
    <h1 className="text-2xl font-bold">Contacto y privacidad</h1>
    <p>777 Picks es un proyecto independiente. El contacto se realiza a través de los administradores de nuestras comunidades; actualmente no hay correo de soporte.</p>
    <p>Para consultas de privacidad, pide contactar en privado con un administrador. No publiques contraseñas, códigos de acceso ni datos personales en los grupos.</p>
    <div className="flex flex-col gap-3">{links.map(link => <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-white/20 p-4 text-sky-300">{link.name} · {link.label}</a>)}</div>
    <p>También puedes <a href="/eliminar-cuenta" className="text-sky-300 underline">eliminar tu cuenta</a> desde la aplicación.</p>
    <a href="/privacidad.html" className="inline-block py-3 text-sky-300">Política de privacidad</a>
  </main>;
}
