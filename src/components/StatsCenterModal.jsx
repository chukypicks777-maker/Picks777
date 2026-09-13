import React, { useState, useEffect } from 'react';
import { X, BarChart3 } from 'lucide-react';
import { sounds } from '../utils/audioEffects';

export default function StatsCenterModal({ onClose }) {
  const [selectedLeague, setSelectedLeague] = useState('espana');
  const [dynamicTable, setDynamicTable] = useState(null);

  const leagueStats = {
    espana: {
      name: "LaLiga EA Sports 🇪🇸",
      table: [
        { rank: 1, team: "Real Madrid", pts: 62, pj: 26, gf: 58, ga: 19, corners: 6.8, form: ["W", "W", "W", "D", "W"] },
        { rank: 2, team: "FC Barcelona", pts: 60, pj: 26, gf: 65, ga: 23, corners: 7.4, form: ["W", "W", "W", "W", "D"] },
        { rank: 3, team: "Atlético de Madrid", pts: 54, pj: 26, gf: 46, ga: 22, corners: 5.2, form: ["W", "D", "W", "W", "L"] },
        { rank: 4, team: "Athletic Club", pts: 49, pj: 26, gf: 39, ga: 24, corners: 6.1, form: ["W", "D", "L", "W", "W"] },
        { rank: 5, team: "Villarreal CF", pts: 45, pj: 26, gf: 42, ga: 33, corners: 5.5, form: ["L", "W", "W", "D", "W"] },
      ]
    },
    inglaterra: {
      name: "Premier League 🏴󠁧󠁢󠁥󠁮󠁧󠁿",
      table: [
        { rank: 1, team: "Arsenal FC", pts: 64, pj: 27, gf: 62, ga: 18, corners: 7.9, form: ["W", "W", "D", "W", "W"] },
        { rank: 2, team: "Liverpool FC", pts: 63, pj: 27, gf: 68, ga: 21, corners: 8.2, form: ["W", "W", "W", "W", "W"] },
        { rank: 3, team: "Manchester City", pts: 58, pj: 27, gf: 59, ga: 28, corners: 7.5, form: ["W", "D", "W", "W", "D"] },
        { rank: 4, team: "Chelsea FC", pts: 51, pj: 27, gf: 52, ga: 31, corners: 6.3, form: ["W", "D", "W", "L", "W"] },
        { rank: 5, team: "Aston Villa", pts: 48, pj: 27, gf: 45, ga: 34, corners: 5.8, form: ["L", "W", "D", "W", "L"] },
      ]
    },
    mexico: {
      name: "Liga MX 🇲🇽",
      table: [
        { rank: 1, team: "Club América", pts: 28, pj: 12, gf: 26, ga: 9, corners: 6.9, form: ["W", "W", "D", "W", "W"] },
        { rank: 2, team: "Cruz Azul", pts: 27, pj: 12, gf: 29, ga: 11, corners: 6.2, form: ["W", "W", "W", "L", "W"] },
        { rank: 3, team: "Rayados Monterrey", pts: 25, pj: 12, gf: 23, ga: 12, corners: 6.5, form: ["W", "D", "W", "W", "D"] },
        { rank: 4, team: "Tigres UANL", pts: 24, pj: 12, gf: 21, ga: 10, corners: 6.1, form: ["W", "W", "D", "W", "L"] },
        { rank: 5, team: "Chivas Guadalajara", pts: 21, pj: 12, gf: 18, ga: 14, corners: 5.4, form: ["W", "L", "W", "D", "W"] },
      ]
    },
    mls: {
      name: "MLS (Major League Soccer) 🇺🇸",
      table: [
        { rank: 1, team: "Inter Miami CF", pts: 48, pj: 22, gf: 58, ga: 28, corners: 6.4, form: ["W", "W", "W", "W", "D"] },
        { rank: 2, team: "LA Galaxy", pts: 44, pj: 22, gf: 51, ga: 34, corners: 6.8, form: ["W", "W", "L", "W", "D"] },
        { rank: 3, team: "Columbus Crew", pts: 43, pj: 22, gf: 47, ga: 26, corners: 5.8, form: ["W", "W", "W", "D", "W"] },
        { rank: 4, team: "LAFC", pts: 42, pj: 22, gf: 49, ga: 30, corners: 7.2, form: ["W", "W", "D", "W", "L"] },
        { rank: 5, team: "Real Salt Lake", pts: 40, pj: 22, gf: 44, ga: 29, corners: 5.6, form: ["D", "L", "W", "W", "D"] },
      ]
    },
    italia: {
      name: "Serie A TIM 🇮🇹",
      table: [
        { rank: 1, team: "Inter de Milán", pts: 59, pj: 25, gf: 57, ga: 16, corners: 6.9, form: ["W", "W", "W", "D", "W"] },
        { rank: 2, team: "Napoli", pts: 56, pj: 25, gf: 48, ga: 18, corners: 6.4, form: ["W", "W", "L", "W", "W"] },
        { rank: 3, team: "Juventus", pts: 51, pj: 25, gf: 40, ga: 15, corners: 5.1, form: ["D", "W", "D", "W", "D"] },
        { rank: 4, team: "Atalanta", pts: 49, pj: 25, gf: 54, ga: 26, corners: 6.7, form: ["W", "L", "W", "W", "D"] },
        { rank: 5, team: "AC Milan", pts: 45, pj: 25, gf: 43, ga: 27, corners: 5.9, form: ["L", "W", "D", "L", "W"] },
      ]
    },
    francia: {
      name: "Ligue 1 McDonald's 🇫🇷",
      table: [
        { rank: 1, team: "Paris Saint-Germain", pts: 62, pj: 24, gf: 64, ga: 18, corners: 7.6, form: ["W", "W", "W", "W", "W"] },
        { rank: 2, team: "AS Monaco", pts: 48, pj: 24, gf: 46, ga: 24, corners: 6.2, form: ["W", "W", "D", "L", "W"] },
        { rank: 3, team: "Olympique Marseille", pts: 46, pj: 24, gf: 44, ga: 25, corners: 5.7, form: ["W", "L", "W", "W", "D"] },
        { rank: 4, team: "Lille OSC", pts: 44, pj: 24, gf: 38, ga: 20, corners: 5.5, form: ["D", "W", "W", "D", "L"] },
      ]
    },
    champions: {
      name: "UEFA Champions League 🏆",
      table: [
        { rank: 1, team: "Bayern München", pts: 18, pj: 7, gf: 22, ga: 7, corners: 8.1, form: ["W", "W", "W", "W", "D"] },
        { rank: 2, team: "Manchester City", pts: 17, pj: 7, gf: 19, ga: 6, corners: 7.2, form: ["W", "W", "D", "W", "W"] },
        { rank: 3, team: "Real Madrid", pts: 16, pj: 7, gf: 18, ga: 8, corners: 7.0, form: ["W", "L", "W", "W", "W"] },
        { rank: 4, team: "Arsenal FC", pts: 16, pj: 7, gf: 17, ga: 5, corners: 7.8, form: ["W", "W", "W", "D", "W"] },
      ]
    },
    leagues_cup: {
      name: "Leagues Cup / Internacional 🌎",
      table: [
        { rank: 1, team: "Tigres UANL", pts: 9, pj: 3, gf: 8, ga: 3, corners: 6.3, form: ["W", "W", "D", "W", "L"] },
        { rank: 2, team: "Seattle Sounders", pts: 7, pj: 3, gf: 6, ga: 4, corners: 5.9, form: ["W", "D", "W", "L", "W"] },
        { rank: 3, team: "Club América", pts: 7, pj: 3, gf: 7, ga: 5, corners: 6.8, form: ["W", "W", "L", "W", "D"] },
      ]
    }
  };

  useEffect(() => {
    let active = true;
    async function fetchStandings() {
      try {
        const res = await fetch(`/api/matches/standings?league=${selectedLeague}`);
        const data = await res.json();
        if (active && data.success && Array.isArray(data.standings) && data.standings.length > 0) {
          setDynamicTable(data.standings);
        } else if (active) {
          setDynamicTable(null);
        }
      } catch {
        if (active) setDynamicTable(null);
      }
    }
    fetchStandings();
    return () => { active = false; };
  }, [selectedLeague]);

  const currentFallback = leagueStats[selectedLeague] || leagueStats.espana;
  const currentTable = dynamicTable || currentFallback.table;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-[#0c1017] border border-white/10 rounded-2xl overflow-hidden shadow-2xl my-8">
        
        {/* Header */}
        <div className="bg-[#101622] border-b border-white/10 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">
                Centro de Estadísticas & Tablas de Clasificación
              </h3>
              <p className="text-xs font-mono text-slate-400">
                Métricas oficiales de rendimiento para las 8 ligas
              </p>
            </div>
          </div>

          <button
            onClick={() => { sounds.playClick(); onClose(); }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* League Selector Ribbon */}
        <div className="flex items-center space-x-1.5 px-6 py-3 border-b border-white/5 bg-[#0e131e] overflow-x-auto">
          {Object.keys(leagueStats).map((lid) => (
            <button
              key={lid}
              onClick={() => {
                sounds.playClick();
                setSelectedLeague(lid);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition whitespace-nowrap cursor-pointer ${
                selectedLeague === lid
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                  : 'bg-[#121824] text-slate-400 hover:text-slate-200 border border-white/5'
              }`}
            >
              {leagueStats[lid].name}
            </button>
          ))}
        </div>

        {/* Table Body */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          <div className="overflow-x-auto rounded-xl border border-white/5 bg-[#0e131d]">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-[#121824] text-slate-400 border-b border-white/10">
                <tr>
                  <th className="py-2.5 px-3.5 text-center">#</th>
                  <th className="py-2.5 px-3.5">Equipo</th>
                  <th className="py-2.5 px-3.5 text-center font-bold text-white">PTS</th>
                  <th className="py-2.5 px-3.5 text-center">PJ</th>
                  <th className="py-2.5 px-3.5 text-center">GF</th>
                  <th className="py-2.5 px-3.5 text-center">GC</th>
                  <th className="py-2.5 px-3.5 text-center">Corners/p</th>
                  <th className="py-2.5 px-3.5 text-center">Forma</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-300">
                {currentTable.map((row, idx) => (
                  <tr key={row.rank || idx} className="hover:bg-white/5 transition">
                    <td className="py-2.5 px-3.5 text-center font-bold text-slate-400">
                      {row.rank || idx + 1}
                    </td>
                    <td className="py-2.5 px-3.5 font-bold text-white flex items-center space-x-2.5">
                      {row.logo && (
                        <img src={row.logo} alt={row.team} className="w-5 h-5 object-contain shrink-0 filter drop-shadow" />
                      )}
                      <span className="truncate max-w-[200px]">{row.team || row.teamName}</span>
                    </td>
                    <td className="py-2.5 px-3.5 text-center font-black text-sky-400 bg-sky-500/5">
                      {row.pts ?? row.points ?? 0}
                    </td>
                    <td className="py-2.5 px-3.5 text-center text-slate-400">{row.pj ?? row.gamesPlayed ?? 0}</td>
                    <td className="py-2.5 px-3.5 text-center text-emerald-400">{row.gf ?? row.goalsFor ?? 0}</td>
                    <td className="py-2.5 px-3.5 text-center text-rose-400">{row.ga ?? row.goalsAgainst ?? 0}</td>
                    <td className="py-2.5 px-3.5 text-center text-sky-300">{row.corners || '5.5'} 🚩</td>
                    <td className="py-2.5 px-3.5 text-center">
                      <div className="flex items-center justify-center space-x-1">
                        {(Array.isArray(row.form) ? row.form : ['W', 'D', 'W']).map((f, fi) => (
                          <span
                            key={fi}
                            className={`w-3.5 h-3.5 text-[8.5px] font-bold rounded flex items-center justify-center ${
                              f === 'W'
                                ? 'bg-emerald-600 text-white'
                                : f === 'D'
                                ? 'bg-amber-600 text-white'
                                : 'bg-rose-600 text-white'
                            }`}
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
