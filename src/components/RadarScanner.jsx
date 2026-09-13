import React, { useEffect, useState, useRef } from 'react';
import { Target } from 'lucide-react';
import { sounds } from '../utils/audioEffects';

export default function RadarScanner({ matchTitle = '', onScanComplete }) {
  const [scanProgress, setScanProgress] = useState(0);
  const [telemetry, setTelemetry] = useState('INICIALIZANDO MOTOR CUÁNTICO...');
  const onCompleteRef = useRef(onScanComplete);
  useEffect(() => {
    onCompleteRef.current = onScanComplete;
  }, [onScanComplete]);

  useEffect(() => {
    sounds.playRadarScan();
    const interval = setInterval(() => {
      setScanProgress(p => {
        if (p >= 100) {
          clearInterval(interval);
          onCompleteRef.current?.();
          return 100;
        }
        if (p === 25) setTelemetry('CALCULANDO xG & MOMENTUM...');
        if (p === 50) setTelemetry('PROCESANDO DIXON-COLES (10,000 ITERACIONES)...');
        if (p === 75) setTelemetry('VALIDANDO MERCADOS DE VALOR Y CORNERS...');
        return p + 5;
      });
    }, 45);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative w-full bg-[#080d16] border border-sky-500/40 rounded-2xl p-6 overflow-hidden text-center shadow-[0_0_50px_rgba(14,165,233,0.15)] font-mono">
      
      {/* Radar sweeping circle */}
      <div className="relative w-44 h-44 mx-auto mb-4 flex items-center justify-center">
        {/* Outer rings */}
        <div className="absolute inset-0 rounded-full border border-sky-500/30 animate-ping opacity-25" />
        <div className="absolute inset-2 rounded-full border border-sky-500/40" />
        <div className="absolute inset-8 rounded-full border border-dashed border-sky-400/40" />
        <div className="absolute inset-16 rounded-full border border-emerald-500/50" />
        
        {/* Crosshair lines */}
        <div className="absolute w-full h-[1px] bg-sky-500/30" />
        <div className="absolute h-full w-[1px] bg-sky-500/30" />

        {/* Sweeping radar sector */}
        <div className="absolute inset-0 rounded-full radar-sweep-line pointer-events-none">
          <div className="w-1/2 h-1/2 bg-gradient-to-br from-sky-400/40 to-transparent rounded-tl-full" />
        </div>

        {/* Center Target Icon */}
        <div className="relative z-10 w-10 h-10 rounded-full bg-[#0c1424] border border-sky-400 flex items-center justify-center text-sky-400 shadow-[0_0_15px_rgba(56,189,248,0.6)]">
          <Target className="w-5 h-5 animate-spin" style={{ animationDuration: '6s' }} />
        </div>
      </div>

      <h4 className="text-white font-bold text-sm mb-1 tracking-wider uppercase font-sans">
        Escaneo Táctico de IA en Tiempo Real
      </h4>
      <p className="text-xs text-sky-400 font-bold mb-3 truncate max-w-sm mx-auto">
        {matchTitle}
      </p>

      {/* Progress Bar */}
      <div className="w-64 max-w-full mx-auto h-2 bg-[#121929] rounded-full overflow-hidden border border-white/10 mb-2">
        <div
          style={{ width: `${scanProgress}%` }}
          className="h-full bg-gradient-to-r from-sky-500 via-indigo-400 to-emerald-400 transition-all duration-75 rounded-full"
        />
      </div>

      <div className="flex items-center justify-between max-w-xs mx-auto text-[10px] text-slate-400">
        <span>{telemetry}</span>
        <span className="font-bold text-sky-300">{scanProgress}%</span>
      </div>

    </div>
  );
}
