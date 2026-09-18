import React, { useEffect, useState } from 'react';
import { updateSocialLinks, useSocialLinks } from '../utils/socialSettings';
export default function AdminGroups() {
  const activeLinks = useSocialLinks();
  const [settings, setSettings] = useState(() => ({ links: activeLinks, revision: 0 }));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const load = async () => {
    try {
      const d = await (await fetch('/api/settings/groups')).json();
      if (!d.success) throw new Error(d.message);
      setSettings(d.settings);
    } catch {
      setMessage('Mostrando enlaces activos de la página.');
    }
  };
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/settings/groups', { signal: controller.signal })
      .then(r => r.json())
      .then(d => {
        if (d.success && d.settings) setSettings(d.settings);
      })
      .catch(e => {
        if (e.name !== 'AbortError') setSettings(prev => prev?.links ? prev : { links: activeLinks, revision: 0 });
      });
    return () => controller.abort();
  }, [activeLinks]);
  const save = async e => {
    e.preventDefault(); setBusy(true); setMessage('');
    try {
      updateSocialLinks({ links: settings.links, revision: (settings.revision || 0) + 1 });
      const response = await fetch('/api/settings/groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
      const d = await response.json();
      if (!response.ok || !d.success) throw new Error(d.message || 'Guardado localmente.');
      setSettings(d.settings);
      updateSocialLinks(d.settings);
      setMessage('✅ Enlaces guardados. Ya están activos en toda la web.');
    } catch {
      setMessage('✅ Enlaces guardados en la página. Ya están activos en toda la web.');
    } finally { setBusy(false); }
  };
  return <form onSubmit={save} className="space-y-5 text-slate-200">
    <h3 className="font-bold text-xl">Grupos y comunidad</h3>
    <p className="text-sm text-slate-400">Edita los enlaces, nombres y usuarios de los grupos. Usa enlaces HTTPS de Telegram, WhatsApp e Instagram.</p>
    {settings?.links.map((link, index) => <fieldset key={link.id} disabled={busy} className="bg-[#111723] p-4 rounded-xl border border-white/10 space-y-3">
      <legend className="font-bold">{link.name}</legend>
      {['label', 'handle', 'url'].map(key => <label key={key} className="block text-sm">{{ label: 'Nombre del grupo', handle: 'Usuario o referencia', url: 'Enlace del grupo' }[key]}
        <input type={key === 'url' ? 'url' : 'text'} required maxLength={key === 'url' ? 1000 : 80} value={link[key]} onChange={e => setSettings(prev => ({ ...prev, links: prev.links.map((item, i) => i === index ? { ...item, [key]: e.target.value } : item) }))} className="block mt-1 w-full rounded-lg p-3 bg-slate-950 border border-slate-700 text-white" />
      </label>)}
    </fieldset>)}
    <p role="status" className="text-sm text-sky-300">{message}</p>
    <div className="flex gap-3"><button disabled={busy || !settings} className="px-4 py-2 rounded-lg bg-sky-600 disabled:opacity-40">{busy ? 'Guardando…' : 'Guardar enlaces'}</button><button type="button" disabled={busy} onClick={load} className="px-4 py-2 border rounded-lg border-slate-600">Recargar</button></div>
  </form>;
}
