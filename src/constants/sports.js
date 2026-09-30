export const SPORTS = [
  { id: 'futbol', name: 'Fútbol', icon: '⚽', path: '/' },
  { id: 'beisbol', name: 'Béisbol', icon: '⚾', path: '/beisbol' },
  { id: 'tenis', name: 'Tenis', icon: '🎾', path: '/tenis' },
  { id: 'basquetbol', name: 'Básquetbol', icon: '🏀', path: '/basquetbol' }
];

export function sportFromPath(pathname) {
  return SPORTS.find(sport => sport.path !== '/' && sport.path === pathname.replace(/\/$/, ''))?.id || 'futbol';
}
