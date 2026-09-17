import React, { useState, useEffect, useCallback } from 'react';
import { 
  X, 
  Crown, 
  Copy, 
  Check, 
  Trash2, 
  Ban, 
  Download,
  Eye,
  EyeOff,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Globe,
  Key,
  Zap,
  Search,
  Cpu
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { sounds } from '../utils/audioEffects';
import { PROVIDER_PRESETS } from '../constants/aiProviders';


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

  // AI Configuration states
  const [settings, setSettings] = useState({
    provider: 'openrouter',
    selectedModel: 'nvidia/nemotron-3.5-lightning:free',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyMasked: '',
    isConfigured: false
  });
  const [provider, setProvider] = useState('openrouter');
  const [newModel, setNewModel] = useState('nvidia/nemotron-3.5-lightning:free');
  const [customModelInput, setCustomModelInput] = useState('');
  const [newApiKey, setNewApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState('https://openrouter.ai/api/v1');
  const [savedSettingsMsg, setSavedSettingsMsg] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Models catalog states
  const [availableModelsList, setAvailableModelsList] = useState([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [modelCategoryFilter, setModelCategoryFilter] = useState('all');

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

  const fetchModelsForProvider = useCallback(async (p = provider, key = newApiKey, url = baseUrl) => {
    setLoadingModels(true);
    try {
      const params = new URLSearchParams();
      params.append('provider', p);
      if (key && key.trim()) params.append('apiKey', key.trim());
      if (url && url.trim()) params.append('baseUrl', url.trim());
      const res = await fetch(`/api/settings/models?${params.toString()}`, {
        headers: { 'x-admin-key': 'DeportePicks' }
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.models)) {
        setAvailableModelsList(data.models);
      }
    } catch (err) {
      console.error('Error loading models:', err);
    } finally {
      setLoadingModels(false);
    }
  }, [provider, newApiKey, baseUrl]);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings', {
        headers: { 'x-admin-key': 'DeportePicks' }
      });
      const data = await res.json();
      if (data.success && data.settings) {
        setSettings(data.settings);
        const prov = data.settings.provider || 'openrouter';
        setProvider(prov);
        setBaseUrl(data.settings.baseUrl || PROVIDER_PRESETS[prov]?.defaultBaseUrl || 'https://openrouter.ai/api/v1');
        setNewModel(data.settings.selectedModel || PROVIDER_PRESETS[prov]?.defaultModel || 'nvidia/nemotron-3.5-lightning:free');
        fetchModelsForProvider(prov, '', data.settings.baseUrl);
      }
    } catch {}
  }, [fetchModelsForProvider]);

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
    if (e) e.preventDefault();
    setIsSaving(true);
    setSavedSettingsMsg('');
    try {
      const targetModel = customModelInput.trim() || newModel;
      const res = await fetch('/api/settings/update', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-key': 'DeportePicks'
        },
        body: JSON.stringify({
          provider,
          selectedModel: targetModel,
          modelName: targetModel,
          baseUrl: baseUrl.trim(),
          apiKey: newApiKey.trim() || undefined
        })
      });
      const data = await res.json();
      if (data.success) {
        sounds.playSuccess();
        confetti({ particleCount: 35, spread: 50, origin: { y: 0.6 } });
        setSavedSettingsMsg('Configuración del motor de IA guardada exitosamente.');
        setSettings(data.settings);
        setNewApiKey('');
        window.dispatchEvent(new CustomEvent('ai-settings-updated', { detail: data.settings }));
        setTimeout(() => setSavedSettingsMsg(''), 4000);
      } else {
        alert(data.message || 'Error al guardar la configuración.');
      }
    } catch (err) {
      alert('Error de conexión al guardar configuración.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const targetModel = customModelInput.trim() || newModel;
      const res = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-key': 'DeportePicks'
        },
        body: JSON.stringify({
          provider,
          apiKey: newApiKey.trim() || undefined,
          baseUrl: baseUrl.trim(),
          selectedModel: targetModel
        })
      });
      const data = await res.json();
      setTestResult(data);
      if (data.success) {
        sounds.playSuccess();
      } else {
        sounds.playClick();
      }
    } catch (err) {
      setTestResult({ success: false, message: 'Error al enviar petición de prueba.' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleClearCache = async () => {
    if (!window.confirm('¿Limpiar el caché de pronósticos y modelos de IA?')) return;
    try {
      sounds.playClick();
      await fetch('/api/settings/cache/clear', {
        method: 'POST',
        headers: { 'x-admin-key': 'DeportePicks' }
      });
      setSavedSettingsMsg('Caché de IA eliminado.');
      setTimeout(() => setSavedSettingsMsg(''), 3000);
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

          {/* TAB 3: AI CONFIG (MULTI-PROVIDER & MODELOS REALES) */}
          {activeTab === 'ai_config' && (
            <div className="max-w-2xl mx-auto space-y-4">
              
              {/* Header Status Card */}
              <div className="bg-[#111723] rounded-xl p-4 border border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-sky-500/10 border border-sky-500/20 rounded-lg text-sky-400">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-white font-sans flex items-center space-x-2">
                      <span>Motor de Inteligencia Artificial</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                        settings.isConfigured ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30' : 'bg-slate-800 text-slate-300 border border-white/10'
                      }`}>
                        {settings.isConfigured ? 'CONECTADO' : 'MODO ESTADÍSTICO'}
                      </span>
                    </h4>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                      {settings.isConfigured 
                        ? `Proveedor activo: ${settings.provider?.toUpperCase()} • Modelo: ${settings.selectedModel}`
                        : 'Sin clave configurada. Los pronósticos usan análisis cuantitativo y Poisson.'}
                    </p>
                  </div>
                </div>

                {settings.apiKeyMasked && (
                  <div className="text-right font-mono text-[10px] text-slate-400 bg-black/30 px-2.5 py-1.5 rounded-lg border border-white/5">
                    <span className="block text-slate-500">Clave en Servidor:</span>
                    <span className="text-sky-300 font-bold">{settings.apiKeyMasked}</span>
                  </div>
                )}
              </div>

              {/* Main Configuration Form */}
              <div className="bg-[#111723] rounded-xl p-5 border border-white/10 space-y-4 font-mono text-xs">
                
                {/* 1. Selector de Proveedor */}
                <div>
                  <label className="block text-slate-300 font-bold mb-2 font-sans flex items-center justify-between">
                    <span>1. Selecciona el Proveedor de IA:</span>
                    <span className="text-[10px] font-normal text-slate-400 font-mono">Compatible con cualquier API</span>
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {Object.values(PROVIDER_PRESETS).map((p) => {
                      const isSelected = provider === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            sounds.playClick();
                            setProvider(p.id);
                            setBaseUrl(p.defaultBaseUrl);
                            setNewModel(p.defaultModel);
                            setCustomModelInput('');
                            fetchModelsForProvider(p.id, newApiKey || undefined, p.defaultBaseUrl);
                          }}
                          className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between space-y-1 ${
                            isSelected
                              ? 'bg-sky-500/15 border-sky-400/60 shadow-[0_0_15px_rgba(56,189,248,0.15)] text-white'
                              : 'bg-[#0b1019] border-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/5'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-base">{p.icon}</span>
                            <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono ${
                              isSelected ? 'bg-sky-400 text-black font-bold' : 'bg-white/5 text-slate-500'
                            }`}>
                              {p.badge}
                            </span>
                          </div>
                          <span className="font-bold text-xs font-sans text-white truncate block">
                            {p.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Clave API del Proveedor */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-300 font-bold font-sans flex items-center space-x-1.5">
                      <Key className="w-3.5 h-3.5 text-sky-400" />
                      <span>2. Clave API ({PROVIDER_PRESETS[provider]?.name}):</span>
                    </label>
                    <span className="text-[10px] text-slate-500">
                      {settings.apiKeyMasked ? `Actual: ${settings.apiKeyMasked}` : 'No configurada'}
                    </span>
                  </div>

                  <div className="relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={newApiKey}
                      onChange={(e) => setNewApiKey(e.target.value)}
                      placeholder={settings.apiKeyMasked ? `Dejar vacío para conservar clave actual (${settings.apiKeyMasked})` : PROVIDER_PRESETS[provider]?.keyPlaceholder}
                      className="w-full pl-3 pr-10 py-2 bg-[#090d15] border border-white/10 rounded-lg text-white placeholder:text-slate-600 focus:outline-none focus:border-sky-400 transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white cursor-pointer"
                    >
                      {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 flex items-center justify-between">
                    <span>{PROVIDER_PRESETS[provider]?.keyHelp}</span>
                    <span className="text-slate-500">Almacenada con cifrado en servidor</span>
                  </p>
                </div>

                {/* 3. URL Base (Endpoint) */}
                <div className="space-y-1 pt-1">
                  <label className="text-slate-300 font-bold font-sans flex items-center space-x-1.5">
                    <Globe className="w-3.5 h-3.5 text-indigo-400" />
                    <span>3. Endpoint / URL Base del Proveedor:</span>
                  </label>
                  <input
                    type="text"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://api..."
                    className="w-full px-3 py-1.5 bg-[#090d15] border border-white/10 rounded-lg text-slate-300 font-mono text-xs focus:outline-none focus:border-indigo-400"
                  />
                </div>

                {/* 4. Modelos Reales del Proveedor */}
                <div className="space-y-3 pt-2 border-t border-white/5">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <div>
                      <label className="text-slate-200 font-bold font-sans flex items-center space-x-1.5">
                        <Cpu className="w-3.5 h-3.5 text-sky-400" />
                        <span>4. Modelos Extraídos de la API ({availableModelsList.length}):</span>
                      </label>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                        Extraídos en vivo directamente de la cuenta del proveedor sin listas predefinidas
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        sounds.playClick();
                        fetchModelsForProvider(provider, newApiKey || undefined, baseUrl);
                      }}
                      disabled={loadingModels}
                      className="px-3 py-1.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 rounded-lg text-xs font-mono font-medium flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 transition"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingModels ? 'animate-spin text-sky-400' : ''}`} />
                      <span>{loadingModels ? 'Extrayendo...' : 'Cargar Modelos'}</span>
                    </button>
                  </div>

                  {/* Banner de Modelo Actualmente Activo */}
                  <div className="p-3 bg-[#0d1424] rounded-xl border border-sky-500/30 flex items-center justify-between">
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400 shrink-0">
                        <Cpu className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">
                          Modelo Seleccionado
                        </span>
                        <span className="font-bold text-sky-300 font-mono text-xs truncate block">
                          {customModelInput.trim() || newModel}
                        </span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 text-[10px] font-bold font-mono shrink-0 ml-2">
                      ACTIVO
                    </span>
                  </div>

                  {/* Filtros Rápidos y Buscador si hay modelos */}
                  {availableModelsList.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => setModelCategoryFilter('all')}
                          className={`px-2.5 py-1 rounded text-[11px] font-mono transition cursor-pointer ${
                            modelCategoryFilter === 'all' 
                              ? 'bg-sky-400 text-black font-bold' 
                              : 'bg-white/5 text-slate-400 hover:text-white border border-white/5'
                          }`}
                        >
                          Todos ({availableModelsList.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setModelCategoryFilter('reasoning')}
                          className={`px-2.5 py-1 rounded text-[11px] font-mono transition cursor-pointer flex items-center space-x-1 ${
                            modelCategoryFilter === 'reasoning' 
                              ? 'bg-amber-400 text-black font-bold' 
                              : 'bg-amber-400/10 text-amber-300 border border-amber-400/20 hover:bg-amber-400/20'
                          }`}
                        >
                          <span>Razonamiento</span>
                          <span>({availableModelsList.filter(m => m.isReasoning).length})</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setModelCategoryFilter('free')}
                          className={`px-2.5 py-1 rounded text-[11px] font-mono transition cursor-pointer flex items-center space-x-1 ${
                            modelCategoryFilter === 'free' 
                              ? 'bg-emerald-500 text-black font-bold' 
                              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'
                          }`}
                        >
                          <span>Gratis (:free)</span>
                          <span>({availableModelsList.filter(m => m.isFree).length})</span>
                        </button>
                      </div>

                      {/* Buscador de modelos */}
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-500">
                          <Search className="w-3.5 h-3.5" />
                        </div>
                        <input
                          type="text"
                          value={modelSearchQuery}
                          onChange={(e) => setModelSearchQuery(e.target.value)}
                          placeholder="Buscar modelo por nombre o ID (ej: deepseek, glm, flash, mini)..."
                          className="w-full pl-8 pr-3 py-1.5 bg-[#090d15] border border-white/10 rounded-lg text-slate-200 text-xs placeholder:text-slate-600 focus:outline-none focus:border-sky-400 font-mono"
                        />
                      </div>
                    </div>
                  )}

                  {/* Catálogo Visual de Modelos */}
                  {loadingModels ? (
                    <div className="p-6 rounded-xl bg-[#090d15] border border-white/5 text-center flex flex-col items-center justify-center space-y-2">
                      <RefreshCw className="w-5 h-5 text-sky-400 animate-spin" />
                      <span className="text-xs font-mono text-slate-400">
                        Extrayendo catálogo de modelos desde la API del proveedor...
                      </span>
                    </div>
                  ) : availableModelsList.length === 0 ? (
                    <div className="p-4 rounded-xl bg-[#090d15] border border-white/5 text-center space-y-1">
                      <p className="text-xs text-slate-300 font-sans">
                        No hay modelos extraídos todavía.
                      </p>
                      <p className="text-[11px] text-slate-500 font-mono">
                        Ingresa tu API Key arriba y haz clic en <strong>"Cargar Modelos"</strong> para listar los modelos habilitados en tu cuenta, o escribe el ID directamente abajo.
                      </p>
                    </div>
                  ) : (
                    <div className="max-h-64 overflow-y-auto space-y-1.5 p-1 rounded-xl bg-[#090d15] border border-white/5 pr-1.5">
                      {availableModelsList
                        .filter(m => {
                          const id = (m.id || '').toLowerCase();
                          const name = (m.name || '').toLowerCase();
                          const query = modelSearchQuery.toLowerCase().trim();
                          if (query && !id.includes(query) && !name.includes(query)) return false;

                          if (modelCategoryFilter === 'reasoning') return m.isReasoning;
                          if (modelCategoryFilter === 'free') return m.isFree;
                          return true;
                        })
                        .map((m) => {
                          const isSelected = (newModel === m.id && !customModelInput.trim());
                          return (
                            <div
                              key={m.id}
                              onClick={() => {
                                sounds.playClick();
                                setNewModel(m.id);
                                setCustomModelInput('');
                              }}
                              className={`p-2.5 rounded-lg border text-left transition cursor-pointer flex items-center justify-between gap-2 ${
                                isSelected
                                  ? 'bg-sky-500/15 border-sky-400/60 shadow-[0_0_12px_rgba(56,189,248,0.15)] text-white'
                                  : 'bg-[#0c121e] border-white/5 text-slate-300 hover:border-white/20 hover:bg-white/5'
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center space-x-2 flex-wrap gap-y-1 mb-0.5">
                                  <span className="font-bold text-xs text-white truncate font-sans">
                                    {m.name || m.id}
                                  </span>
                                  {m.isReasoning && (
                                    <span className="px-1.5 py-0.2 rounded bg-amber-400/10 border border-amber-400/30 text-amber-300 text-[9px] font-mono font-medium">
                                      Razonamiento
                                    </span>
                                  )}
                                  {m.isFree && (
                                    <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[9px] font-mono font-medium">
                                      Gratis
                                    </span>
                                  )}
                                  {m.contextLength && (
                                    <span className="px-1.5 py-0.2 rounded bg-white/5 text-slate-400 text-[9px] font-mono">
                                      {Math.round(m.contextLength / 1000)}k ctx
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] font-mono text-sky-400/80 block truncate">
                                  {m.id}
                                </span>
                              </div>

                              <div className="shrink-0">
                                {isSelected ? (
                                  <span className="px-2.5 py-1 rounded bg-sky-400 text-black font-bold text-[10px] font-mono">
                                    Activo
                                  </span>
                                ) : (
                                  <span className="px-2 py-1 rounded bg-white/5 text-slate-400 hover:text-white text-[10px] font-mono">
                                    Elegir
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}

                  {/* Entrada manual de modelo */}
                  <div className="pt-2 border-t border-white/5">
                    <span className="text-[11px] text-slate-300 block mb-1 font-sans">
                      O escribe / pega el ID del modelo manualmente:
                    </span>
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={customModelInput}
                        onChange={(e) => setCustomModelInput(e.target.value)}
                        placeholder={`Ej: ${newModel || 'deepseek/deepseek-r1'}`}
                        className="flex-1 px-3 py-1.5 bg-[#090d15] border border-white/10 rounded-lg text-white font-mono text-xs placeholder:text-slate-600 focus:outline-none focus:border-sky-400"
                      />
                      {customModelInput.trim() && (
                        <button
                          type="button"
                          onClick={() => {
                            setNewModel(customModelInput.trim());
                            setCustomModelInput('');
                            sounds.playClick();
                          }}
                          className="px-3 py-1.5 bg-sky-400 text-black font-bold text-xs rounded-lg cursor-pointer"
                        >
                          Fijar
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Panel de prueba de conexión */}
                {testResult && (
                  <div className={`p-3 rounded-lg border text-xs font-mono flex items-start space-x-2 ${
                    testResult.success
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  }`}>
                    {testResult.success ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                    )}
                    <div>
                      <span className="font-bold block">{testResult.message}</span>
                      {testResult.sample && (
                        <span className="text-[10px] text-slate-400 block mt-0.5">
                          Respuesta del modelo: "{testResult.sample}"
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {savedSettingsMsg && (
                  <div className="p-2.5 bg-emerald-500/15 border border-emerald-500/30 rounded-lg text-emerald-300 font-bold flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>{savedSettingsMsg}</span>
                  </div>
                )}

                {/* Botones de Acción */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-white/5">
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={handleSaveSettings}
                      disabled={isSaving}
                      className="px-4 py-2 bg-sky-400 hover:bg-sky-300 text-black font-bold rounded-lg transition cursor-pointer shadow-[0_0_12px_rgba(56,189,248,0.3)] disabled:opacity-50 flex items-center space-x-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{isSaving ? 'Guardando...' : 'Guardar Configuración de IA'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={isTesting}
                      className="px-3 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg font-semibold transition cursor-pointer flex items-center space-x-1.5 disabled:opacity-50"
                    >
                      <Zap className={`w-3.5 h-3.5 ${isTesting ? 'animate-pulse text-amber-400' : ''}`} />
                      <span>{isTesting ? 'Probando...' : 'Probar Conexión'}</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleClearCache}
                    className="px-3 py-2 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 rounded-lg transition cursor-pointer text-[11px]"
                  >
                    Limpiar Caché de IA
                  </button>
                </div>

              </div>

            </div>
          )}

        </div>

      </div>
    </div>
  );
}
