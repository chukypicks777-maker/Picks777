import { SOCIAL_LINKS } from '../src/constants/socials.js';
export function validateSocialLinks(links) {
  if (!Array.isArray(links) || links.length !== SOCIAL_LINKS.length) throw new Error('Incluye los tres grupos.');
  const domains = { telegram: ['t.me'], whatsapp: ['chat.whatsapp.com', 'wa.me'], instagram: ['www.instagram.com', 'instagram.com'] };
  return SOCIAL_LINKS.map(original => {
    const entries = links.filter(v => v?.id === original.id);
    if (entries.length !== 1) throw new Error('Grupo inválido o duplicado.');
    const value = entries[0];
    if (typeof value.url !== 'string' || value.url.length > 1000) throw new Error('Enlace inválido.');
    const url = new URL(value.url.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !domains[original.id].includes(url.hostname) || url.pathname === '/') throw new Error(`Enlace de ${original.name} inválido.`);
    for (const key of ['label', 'handle']) if (typeof value[key] !== 'string' || !value[key].trim() || value[key].length > 80) throw new Error(`Nombre de ${original.name} inválido.`);
    return { ...original, url: url.href, label: value.label.trim(), handle: value.handle.trim() };
  });
}
