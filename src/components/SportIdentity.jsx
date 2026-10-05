import React, { useState } from 'react';

export default function SportIdentity({ team, size = 'small' }) {
  const [index, setIndex] = useState(0);
  const images = [...new Set([team.logo, team.flag].filter(Boolean))];
  const source = images[index];
  const initials = team.name?.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase() || '?';
  const box = size === 'large' ? 'w-12 h-12 text-sm' : 'w-8 h-8 text-[10px]';
  const countryImage = source === team.flag || team.imageKind === 'country';
  return <span className={`${box} shrink-0 inline-flex items-center justify-center rounded-lg border border-white/10 bg-[#121824] overflow-hidden`}>
    {source ? <img src={source} alt={countryImage ? `Bandera de ${team.country || team.name}` : team.name} title={countryImage ? `${team.name} · ${team.country || 'país'}` : team.name}
      className={`w-full h-full ${countryImage ? 'object-contain p-1' : 'object-contain'}`} loading="lazy" onError={() => setIndex(value => value + 1)} />
      : <span role="img" aria-label={`Iniciales de ${team.name}`} className="font-mono font-bold text-sky-300">{initials}</span>}
  </span>;
}
