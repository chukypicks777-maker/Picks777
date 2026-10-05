export const LEAGUES_DATA = [
  { id: 'all', name: 'Todas las Ligas', flag: '🌍' },
  { id: 'espana', name: 'LaLiga', flag: '🇪🇸' },
  { id: 'inglaterra', name: 'Premier League', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { id: 'mexico', name: 'Liga MX', flag: '🇲🇽' },
  { id: 'champions', name: 'Champions League', flag: '🏆' },
  { id: 'italia', name: 'Serie A', flag: '🇮🇹' },
  { id: 'francia', name: 'Ligue 1', flag: '🇫🇷' },
  { id: 'mls', name: 'MLS', flag: '🇺🇸' },
  { id: 'leagues_cup', name: 'Leagues Cup / Copas', flag: '🌎' },
];

export const WOMENS_LEAGUES = [
  { id: 'all', name: 'Todas las Ligas', flag: '🌍' },
  { id: 'mexico_femenil', name: 'Liga MX Femenil', flag: '🇲🇽' }
];

export const SPORT_LEAGUES = {
  beisbol: [
    { id: 'mlb', name: 'MLB', flag: '🇺🇸', provider: 'mlb', sportId: 1 },
    { id: 'npb', name: 'NPB', flag: '🇯🇵', provider: 'npb', allowsDraw: true },
    { id: 'kbo', name: 'KBO', flag: '🇰🇷', provider: 'kbo', allowsDraw: true },
    { id: 'lmb', name: 'LMB', flag: '🇲🇽', provider: 'mlb', sportId: 23, leagueId: 125 }
  ],
  tenis: [
    { id: 'wimbledon', name: 'Wimbledon', flag: '🎾' },
    { id: 'australian_open', name: 'Open de Australia', flag: '🇦🇺' },
    { id: 'roland_garros', name: 'Roland Garros', flag: '🇫🇷' },
    { id: 'us_open', name: 'Abierto de Estados Unidos', flag: '🇺🇸' },
    { id: 'atp', name: 'ATP', flag: '🎾' },
    { id: 'wta', name: 'WTA', flag: '🎾' }
  ],
  basquetbol: [
    { id: 'nba', name: 'NBA', flag: '🇺🇸', espnCode: 'nba' },
    { id: 'nba_preseason', name: 'Pretemporada NBA', flag: '🇺🇸', espnCode: 'nba', preseason: true },
    { id: 'ncaaw', name: 'NCAAB (F)', flag: '🇺🇸', espnCode: 'womens-college-basketball' },
    { id: 'wnba', name: 'WNBA', flag: '🇺🇸', espnCode: 'wnba' }
  ]
};
