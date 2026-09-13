import React, { useState, useEffect, useCallback } from 'react';
import { 
  X, 
  Crown, 
  Copy, 
  Check, 
  Trash2, 
  Ban, 
  Download 
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { sounds } from '../utils/audioEffects';

export default function AdminDashboardModal({ onClose }) {
  const [activeTab, setActiveTab] = useState('generator');
  const [codes, setCodes] = useState([]);
  const [stats, setStats] = useState({ total: 0, active: 0, available: 0, expired: 0 });
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState(null);
  const [copiedAll, setCopiedAll] = useState(false);

  // Generator states
  const [batchCount, setBatchCount] = useState(30);
  const [durationDays, setDurationDays] = useState(30);
  const [prefix, setPrefix] = useState('VIP');
  const [singleCode, setSingleCode] = useState('');
  const [singleDuration, setSingleDuration] = useState(30);

  // Settings states
  const [settings, setSettings] = useState({ selectedModel: 'z-ai/glm-5.2:free', openRouterApiKeyMasked: '' });
  const [newModel, setNewModel] = useState('z-ai/glm-5.2:free');
  const [newApiKey, setNewApiKey] = useState('');
  const [savedSettingsMsg, setSavedSettingsMsg] = useState('');

  // Table filters
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const fetchCodes = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/codes', {
        headers: { 'x-admin-key': 'DeportePicks' }
      });
      const data = await res.json();
      if (data.success) {
        setCodes(data.codes || []);
        setStats(data.stats || { total: 0, active: 0, available: 0, expired: 0 });
      }
    } catch (err) {
      console.error('Error fetching admin codes:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.success && data.settings) {
        setSettings(data.settings);
        setNewModel(data.settings.selectedModel || 'z-ai/glm-5.2:free');
      }
    } catch {}
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      if (active) {
        await fetchCodes();
        await fetchSettings();
      }
    })();
    return () => {
      active = false;
    };
  }, [fetchCodes, fetchSettings]);

  const handleGenerateBatch = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/admin/codes/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': 'DeportePicks'
        },
        body: JSON.stringify({
          count: parseInt(batchCount, 10),
          durationDays: parseInt(durationDays, 10),
          prefix: prefix.trim() || 'VIP'
        })
      });
      const data = await res.json();
      if (data.success) {
        sounds.playSuccess();
        confetti({ particleCount: 40, spread: 50, origin: { y: 0.6 } });
        fetchCodes();
        setActiveTab('codes_list');
      }
    } catch (e) {
      console.error('Error generating batch:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSingle = async (e) => {
    e.preventDefault();
    if (!singleCode.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/admin/codes/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': 'DeportePicks'
        },
        body: JSON.stringify({
          code: singleCode.trim(),
          durationDays: parseInt(singleDuration, 10),
          label: 'Manual'
        })
      });
      const data = await res.json();
      if (data.success) {
        sounds.playSuccess();
        setSingleCode('');
        fetchCodes();
        setActiveTab('codes_list');
      }
    } catch (e) {
      alert(e.message || 'Error al crear código.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCode = async (codeString) => {
    if (!window.confirm(`¿Eliminar el código ${codeString}?`)) return;
    try {
      sounds.playClick();
      await fetch(`/api/admin/codes/${encodeURIComponent(codeString)}`, {
        method: 'DELETE',
        headers: { 'x-admin-key': 'DeportePicks' }
      });
      fetchCodes();
    } catch {}
  };

  const handleRevokeCode = async (codeString) => {
    if (!window.confirm(`¿Revocar acceso para el código ${codeString}?`)) return;
    try {
      sounds.playClick();
      await fetch(`/api/admin/codes/${encodeURIComponent(codeString)}/revoke`, {
        method: 'POST',
        headers: { 'x-admin-key': 'DeportePicks' }
      });
      fetchCodes();
    } catch {}
  };

  const handleCopyCode = (codeString) => {
    sounds.playClick();
    navigator.clipboard.writeText(codeString);
    setCopiedCode(codeString);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleCopyAllAvailable = () => {
    sounds.playClick();
    const available = codes.filter(c => !c.isClaimed).map(c => `${c.code} (${c.durationDays} días)`).join('\n');
    navigator.clipboard.writeText(available);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const handleExportCSV = () => {
    sounds.playClick();
    const headers = "Codigo,Duracion_Dias,Estado,Usuario,Fecha_Creacion,Fecha_Reclamado,Fecha_Vencimiento,Dias_Restantes\n";
    const rows = codes.map(c =>
      `"${c.code}",${c.durationDays},"${c.status}","${c.claimedBy || ''}","${c.createdAt || ''}","${c.claimedAt || ''}","${c.expiresAt || ''}",${c.daysRemaining || 0}`
    ).join('\n');

    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `codigos_vip_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/settings/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminKey: 'DeportePicks',
          selectedModel: newModel,
          openRouterApiKey: newApiKey || undefined
        })
      });
      const data = await res.json();
      if (data.success) {
        sounds.playSuccess();
        setSavedSettingsMsg('Configuración guardada.');
        setTimeout(() => setSavedSettingsMsg(''), 3000);
        fetchSettings();
      }
    } catch {}
  };

  const handleClearCache = async () => {
    if (!window.confirm('¿Limpiar el caché de pronósticos?')) return;
    try {
      sounds.playClick();
      await fetch('/api/admin/cache/clear', {
        method: 'POST',
        headers: { 'x-admin-key': 'DeportePicks' }
      });
      alert('Caché eliminada.');
    } catch {}
  };

  const filteredCodes = codes.filter(c => {
    const matchesSearch = c.code.toLowerCase().includes(searchFilter.toLowerCase());
    if (statusFilter === 'AVAILABLE') return matchesSearch && !c.isClaimed;
    if (statusFilter === 'ACTIVE') return matchesSearch && c.isClaimed && !c.isExpired;
    if (statusFilter === 'EXPIRED') return matchesSearch && c.isExpired;
    return matchesSearch;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-[#0c1017] border border-white/10 rounded-2xl overflow-hidden shadow-2xl my-8">
        
        {/* Header */}
        <div className="bg-[#101622] border-b border-white/10 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <img 
                src="/logo.jpg" 
                alt="777 Picks" 
                className="w-9 h-9 rounded-full object-cover border border-amber-500/50"
              />
              <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-black flex items-center justify-center">
                <Crown className="w-2.5 h-2.5" />
              </div>
            </div>
            <div>
              <h3 className="font-bold text-base text-white">
                Panel de Administración • 777 Picks Owner
              </h3>
              <p className="text-xs font-mono text-slate-400">
                Gestión centralizada de licencias y generación de códigos
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

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-5 bg-[#0e131e] border-b border-white/5 font-mono text-xs">
          <div className="bg-[#121824] p-3 rounded-xl border border-white/5">
            <span className="text-slate-400 block text-[11px]">Total Códigos</span>
            <span className="text-xl font-bold text-white mt-0.5 block">{stats.total}</span>
          </div>
          <div className="bg-[#121824] p-3 rounded-xl border border-emerald-500/20">
            <span className="text-emerald-400 block text-[11px]">Activos / Reclamados</span>
            <span className="text-xl font-bold text-emerald-400 mt-0.5 block">{stats.active}</span>
          </div>
          <div className="bg-[#121824] p-3 rounded-xl border border-sky-500/20">
            <span className="text-sky-400 block text-[11px]">Disponibles</span>
            <span className="text-xl font-bold text-sky-400 mt-0.5 block">{stats.available}</span>
          </div>
          <div className="bg-[#121824] p-3 rounded-xl border border-rose-500/20">
            <span className="text-rose-400 block text-[11px]">Expirados</span>
            <span className="text-xl font-bold text-rose-400 mt-0.5 block">{stats.expired}</span>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center space-x-1 px-6 pt-3 border-b border-white/10 bg-[#0a0d14]">
          <button
            onClick={() => { sounds.playClick(); setActiveTab('generator'); }}
            className={`px-4 py-2.5 border-b-2 text-xs font-semibold transition ${
              activeTab === 'generator'
                ? 'border-amber-400 text-amber-300 bg-amber-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Generador de Códigos (Lotes)
          </button>

          <button
            onClick={() => { sounds.playClick(); setActiveTab('codes_list'); }}
            className={`px-4 py-2.5 border-b-2 text-xs font-semibold transition ${
              activeTab === 'codes_list'
                ? 'border-sky-400 text-sky-300 bg-sky-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Base de Datos ({codes.length})
          </button>

          <button
            onClick={() => { sounds.playClick(); setActiveTab('ai_config'); }}
            className={`px-4 py-2.5 border-b-2 text-xs font-semibold transition ${
              activeTab === 'ai_config'
                ? 'border-indigo-400 text-indigo-300 bg-indigo-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Configuración IA
          </button>
        </div>

        {/* Body Container */}
        <div className="p-6 max-h-[55vh] overflow-y-auto">
          
          {/* TAB 1: GENERATOR */}
          {activeTab === 'generator' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              
              {/* Batch Form */}
              <div className="bg-[#111723] rounded-xl p-5 border border-white/5">
                <h4 className="font-bold text-sm text-white mb-2 font-sans">
                  Generación Masiva de Códigos
                </h4>
                <p className="text-xs text-slate-400 font-sans mb-4">
                  Crea múltiples códigos aleatorios no repetibles con la vigencia deseada.
                </p>

                <form onSubmit={handleGenerateBatch} className="space-y-3.5 text-xs font-mono">
                  <div>
                    <label className="block text-slate-400 mb-1">Cantidad de Códigos:</label>
                    <div className="grid grid-cols-4 gap-2 mb-2">
                      {[10, 30, 50, 100].map(qty => (
                        <button
                          key={qty}
                          type="button"
                          onClick={() => setBatchCount(qty)}
                          className={`py-1.5 rounded-lg font-bold border transition ${
                            batchCount === qty
                              ? 'bg-amber-400 text-black border-amber-400'
                              : 'bg-[#141b29] border-white/5 text-slate-300 hover:border-white/10'
                          }`}
                        >
                          {qty}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      min="1"
                      max="200"
                      value={batchCount}
                      onChange={(e) => setBatchCount(e.target.value)}
                      className="w-full px-3 py-1.5 bg-[#090d15] border border-white/10 rounded-lg text-white font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Duración (Días a partir de activación):</label>
                    <select
                      value={durationDays}
                      onChange={(e) => setDurationDays(e.target.value)}
                      className="w-full px-3 py-2 bg-[#090d15] border border-white/10 rounded-lg text-amber-300 font-bold"
                    >
                      <option value="7">7 Días</option>
                      <option value="15">15 Días</option>
                      <option value="30">30 Días (1 Mes)</option>
                      <option value="60">60 Días (2 Meses)</option>
                      <option value="90">90 Días (Trimestral)</option>
                      <option value="365">365 Días (Anual)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Prefijo:</label>
                    <input
                      type="text"
                      value={prefix}
                      onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                      placeholder="VIP"
                      className="w-full px-3 py-1.5 bg-[#090d15] border border-white/10 rounded-lg text-sky-300 font-bold"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 bg-amber-400 hover:bg-amber-300 text-black font-bold rounded-lg transition cursor-pointer"
                  >
                    {loading ? 'Generando...' : `Generar ${batchCount} Códigos de ${durationDays} Días`}
                  </button>
                </form>
              </div>

              {/* Single Form */}
              <div className="bg-[#111723] rounded-xl p-5 border border-white/5 flex flex-col justify-between">
                <div>
                  <h4 className="font-bold text-sm text-white mb-2 font-sans">
                    Crear Código Individual
                  </h4>
                  <p className="text-xs text-slate-400 font-sans mb-4">
                    Asigna un código personalizado para un cliente específico.
                  </p>

                  <form onSubmit={handleCreateSingle} className="space-y-3.5 text-xs font-mono">
                    <div>
                      <label className="block text-slate-400 mb-1">Código Personalizado:</label>
                      <input
                        type="text"
                        value={singleCode}
                        onChange={(e) => setSingleCode(e.target.value.toUpperCase())}
                        placeholder="EJ: CLIENTE-PRO-30"
                        className="w-full px-3 py-2 bg-[#090d15] border border-white/10 rounded-lg text-sky-300 font-bold"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">Duración en Días:</label>
                      <input
                        type="number"
                        min="1"
                        max="1000"
                        value={singleDuration}
                        onChange={(e) => setSingleDuration(e.target.value)}
                        className="w-full px-3 py-2 bg-[#090d15] border border-white/10 rounded-lg text-white font-bold"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loading || !singleCode.trim()}
                      className="w-full py-2.5 bg-sky-500 hover:bg-sky-400 text-black font-bold rounded-lg transition cursor-pointer disabled:opacity-50"
                    >
                      Crear Código Individual
                    </button>
                  </form>
                </div>

                <div className="mt-4 p-3 bg-[#0d1424] rounded-lg text-[11px] font-mono text-slate-400">
                  ℹ️ La vigencia se calcula <strong>desde la fecha en que el cliente ingresa el código</strong>.
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: CODES LIST */}
          {activeTab === 'codes_list' && (
            <div className="space-y-3.5">
              
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center space-x-2 w-full sm:w-auto">
                  <input
                    type="text"
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    placeholder="Filtrar código..."
                    className="px-3 py-1.5 bg-[#0f141f] border border-white/10 rounded-lg text-xs font-mono text-white"
                  />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-3 py-1.5 bg-[#0f141f] border border-white/10 rounded-lg text-xs font-mono text-sky-300"
                  >
                    <option value="ALL">Todos</option>
                    <option value="AVAILABLE">Disponibles</option>
                    <option value="ACTIVE">Activos</option>
                    <option value="EXPIRED">Expirados</option>
                  </select>
                </div>

                <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                  <button
                    onClick={handleCopyAllAvailable}
                    className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-mono font-medium transition flex items-center space-x-1"
                  >
                    {copiedAll ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedAll ? '¡Copiados!' : 'Copiar Disponibles'}</span>
                  </button>

                  <button
                    onClick={handleExportCSV}
                    className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 rounded-lg text-xs font-mono font-medium transition flex items-center space-x-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>CSV</span>
                  </button>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#0e131d]">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-[#121824] text-slate-400 border-b border-white/10">
                    <tr>
                      <th className="py-2.5 px-3.5">Código</th>
                      <th className="py-2.5 px-3.5">Usuario</th>
                      <th className="py-2.5 px-3.5 text-center">Duración</th>
                      <th className="py-2.5 px-3.5 text-center">Estado</th>
                      <th className="py-2.5 px-3.5">Reclamado</th>
                      <th className="py-2.5 px-3.5">Vence</th>
                      <th className="py-2.5 px-3.5 text-center">Días</th>
                      <th className="py-2.5 px-3.5 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-300">
                    {filteredCodes.map((c, i) => (
                      <tr key={i} className="hover:bg-white/5 transition">
                        <td className="py-2.5 px-3.5 font-bold text-sky-300">{c.code}</td>
                        <td className="py-2.5 px-3.5 text-slate-300 font-sans">{c.claimedBy || (c.isClaimed ? 'VIP' : '—')}</td>
                        <td className="py-2.5 px-3.5 text-center">{c.durationDays}d</td>
                        <td className="py-2.5 px-3.5 text-center">
                          <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                            c.status === 'DISPONIBLE'
                              ? 'bg-sky-500/20 text-sky-300'
                              : c.status === 'ACTIVO'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-rose-500/20 text-rose-400'
                          }`}>
                            {c.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3.5 text-slate-400">
                          {c.claimedAt ? new Date(c.claimedAt).toLocaleDateString('es-ES') : '—'}
                        </td>
                        <td className="py-2.5 px-3.5 text-slate-400">
                          {c.expiresAt ? new Date(c.expiresAt).toLocaleDateString('es-ES') : '—'}
                        </td>
                        <td className="py-2.5 px-3.5 text-center font-bold">
                          {c.daysRemaining !== null ? `${c.daysRemaining}d` : `${c.durationDays}d`}
                        </td>
                        <td className="py-2.5 px-3.5 text-right">
                          <div className="flex items-center justify-end space-x-1">
                            <button
                              onClick={() => handleCopyCode(c.code)}
                              className="p-1 text-slate-400 hover:text-sky-300"
                            >
                              {copiedCode === c.code ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                            {c.isClaimed && !c.isExpired && (
                              <button
                                onClick={() => handleRevokeCode(c.code)}
                                className="p-1 text-slate-400 hover:text-amber-400"
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteCode(c.code)}
                              className="p-1 text-slate-400 hover:text-rose-400"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            </div>
          )}

          {/* TAB 3: AI CONFIG */}
          {activeTab === 'ai_config' && (
            <div className="max-w-xl mx-auto space-y-4">
              <div className="bg-[#111723] rounded-xl p-5 border border-white/5">
                <h4 className="font-bold text-sm text-white mb-3 font-sans">
                  Configuración del Motor de Inteligencia Artificial
                </h4>

                <form onSubmit={handleSaveSettings} className="space-y-3.5 text-xs font-mono">
                  <div>
                    <label className="block text-slate-400 mb-1">Modelo Seleccionado:</label>
                    <select
                      value={newModel}
                      onChange={(e) => setNewModel(e.target.value)}
                      className="w-full px-3 py-2 bg-[#090d15] border border-white/10 rounded-lg text-sky-300 font-bold"
                    >
                      <option value="z-ai/glm-5.2:free">z-ai/glm-5.2:free (Z-AI GLM 5.2)</option>
                      <option value="minimax/minimax-m3:free">minimax/minimax-m3:free (MiniMax M3)</option>
                      <option value="nvidia/nemotron-3.5-lightning:free">nvidia/nemotron-3.5-lightning:free</option>
                      <option value="google/gemma-4-31b-it:free">google/gemma-4-31b-it:free</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">
                      API Key de OpenRouter (Actual: {settings.openRouterApiKeyMasked}):
                    </label>
                    <input
                      type="password"
                      value={newApiKey}
                      onChange={(e) => setNewApiKey(e.target.value)}
                      placeholder="sk-or-v1-..."
                      className="w-full px-3 py-1.5 bg-[#090d15] border border-white/10 rounded-lg text-white"
                    />
                  </div>

                  {savedSettingsMsg && (
                    <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-300">
                      {savedSettingsMsg}
                    </div>
                  )}

                  <div className="flex items-center space-x-3 pt-2">
                    <button
                      type="submit"
                      className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-black font-bold rounded-lg transition cursor-pointer"
                    >
                      Guardar Configuración
                    </button>

                    <button
                      type="button"
                      onClick={handleClearCache}
                      className="px-3 py-2 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 rounded-lg transition cursor-pointer"
                    >
                      Limpiar Caché
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
