import AdminGroups from './AdminGroups';
import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { getStoredAiConfig, saveStoredAiConfig, sanitizeApiKey } from '../utils/aiSettings';
import { clearAllAnalysisCache } from '../utils/analysisCache';


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
    provider: 'custom',
    selectedModel: 'deepseek-v4.1',
    baseUrl: 'https://vyceai.com/v1',
    apiKeyMasked: '',
    isConfigured: false
  });
  const [provider, setProvider] = useState('custom');
  const [newModel, setNewModel] = useState('deepseek-v4.1');
  const [customModelInput, setCustomModelInput] = useState('');
  const [newApiKey, setNewApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState('https://vyceai.com/v1');
  const [savedSettingsMsg, setSavedSettingsMsg] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Models catalog states
  const [availableModelsList, setAvailableModelsList] = useState([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState('');
  const modelRequest = useRef(0);
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [modelCategoryFilter, setModelCategoryFilter] = useState('all');

  // Table filters
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const fetchCodes = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/codes', {
        headers: { }
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

  const fetchModelsForProvider = useCallback(async (p = 'custom', key = '', url = '') => {
    const request = ++modelRequest.current;
    setLoadingModels(true);
    setAvailableModelsList([]);
    setModelsError('');
    try {
      const res = await fetch('/api/settings/models', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: p, apiKey: sanitizeApiKey(key) || undefined, baseUrl: url })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || `No se pudo consultar el catálogo (HTTP ${res.status}).`);
      if (request !== modelRequest.current) return;
      setAvailableModelsList(data.models || []);
      if (!data.models?.length && p !== 'custom') {
        setModelsError('El proveedor devolvió un catálogo vacío. Puedes escribir o seleccionar el ID del modelo abajo.');
      }
    } catch (error) {
      if (request === modelRequest.current) {
        if (!error.message?.includes('Ingresa la clave') && p !== 'custom') {
          setModelsError(error.message || 'No se pudo consultar el catálogo.');
        }
      }
    } finally {
      if (request === modelRequest.current) setLoadingModels(false);
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings', { credentials: 'same-origin' });
      const data = await res.json();
      if (!res.ok || !data.success || !data.settings) throw new Error(data.message || 'No se pudo cargar la configuración del servidor.');
      setSettings(data.settings);
      saveStoredAiConfig(data.settings);
      const prov = data.settings.provider || 'custom';
      const url = data.settings.baseUrl || PROVIDER_PRESETS[prov]?.defaultBaseUrl || '';
      setProvider(prov);
      setBaseUrl(url);
      setNewApiKey('');
      setNewModel(data.settings.selectedModel || PROVIDER_PRESETS[prov]?.defaultModel || 'deepseek-v4.1');
      const activeKey = getStoredAiConfig()?.apiKey || '';
      if (activeKey || data.settings.apiKeyMasked) {
        fetchModelsForProvider(prov, activeKey, url);
      }
    } catch (error) {
      setModelsError(error.message || 'No se pudo cargar la configuración del servidor.');
    }
  }, [fetchModelsForProvider]);

  const invalidateTest = () => { setTestResult(null); setSavedSettingsMsg(''); };

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
          'Content-Type': 'application/json'
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
          'Content-Type': 'application/json'
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
        headers: { }
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
        headers: { }
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

  const connectionInput = () => {
    const chosen = customModelInput.trim() || newModel.trim() || 'deepseek-v4.1';
    return {
      provider,
      baseUrl: baseUrl.trim(),
      selectedModel: chosen,
      modelName: chosen,
      apiKey: sanitizeApiKey(newApiKey) || getStoredAiConfig()?.apiKey || undefined
    };
  };

  const handleSaveSettings = async (e) => {
    e?.preventDefault();
    setIsSaving(true);
    setSavedSettingsMsg('');
    setTestResult(null);
    try {
      const chosenModel = customModelInput.trim() || newModel.trim() || 'deepseek-v4.1';
      const cleanKey = sanitizeApiKey(newApiKey);
      const res = await fetch('/api/settings/update', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          baseUrl: baseUrl.trim(),
          selectedModel: chosenModel,
          modelName: chosenModel,
          apiKey: cleanKey || undefined
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || `No se pudo guardar (HTTP ${res.status}).`);
      setSettings(data.settings);
      setProvider(data.settings.provider);
      setBaseUrl(data.settings.baseUrl || baseUrl);
      setNewModel(data.settings.selectedModel || chosenModel);
      setCustomModelInput('');
      const savedKey = cleanKey || getStoredAiConfig()?.apiKey || '';
      setNewApiKey('');
      saveStoredAiConfig({ ...data.settings, apiKey: savedKey });
      setSavedSettingsMsg(data.settings.selectedModel
        ? `Configuración guardada exitosamente en el servidor (Modelo: ${data.settings.selectedModel}). Usa Probar Conexión para verificar.`
        : 'Clave guardada exitosamente en el servidor.');
      sounds.playSuccess();
      clearAllAnalysisCache();
      window.dispatchEvent(new CustomEvent('ai-settings-updated', { detail: data.settings }));
      if (savedKey || data.settings.apiKeyMasked) {
        fetchModelsForProvider(data.settings.provider, savedKey, data.settings.baseUrl);
      }
    } catch (error) {
      setTestResult({ success: false, message: error.message || 'No se pudo guardar la configuración en el servidor.' });
    } finally { setIsSaving(false); }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/settings/test', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(connectionInput())
      });
      let data;
      try { data = await res.json(); } catch { throw new Error(`El servidor no devolvió JSON (HTTP ${res.status}). Intenta nuevamente.`); }
      setTestResult(data);
      if (data.success) sounds.playSuccess();
    } catch (error) {
      setTestResult({ success: false, message: error.message || 'No se pudo contactar con el servidor.' });
    } finally { setIsTesting(false); }
  };

  const handleClearCache = async () => {
    if (!window.confirm('¿Limpiar el caché de pronósticos y modelos de IA?')) return;
    try {
      sounds.playClick();
      clearAllAnalysisCache();
      await fetch('/api/settings/cache/clear', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { }
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-[#0c1017] border border-white/10 rounded-2xl overflow-hidden shadow-2xl my-2 sm:my-8 overflow-x-hidden">
        
        {/* Header */}
        <div className="bg-[#101622] border-b border-white/10 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
            <div className="relative shrink-0">
              <img 
                src="/logo.jpg" 
                alt="777 Picks" 
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover border border-amber-500/50"
              />
              <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-amber-500 text-black flex items-center justify-center">
                <Crown className="w-2 sm:w-2.5 h-2 sm:h-2.5" />
              </div>
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-xs sm:text-base text-white truncate">
                Panel de Administración • 777 Picks Owner
              </h3>
              <p className="text-[10px] sm:text-xs font-mono text-slate-400 truncate">
                Gestión centralizada de licencias y generación de códigos
              </p>
            </div>
          </div>

          <button
            aria-label="Cerrar panel" onClick={() => { sounds.playClick(); onClose(); }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 p-3.5 sm:p-5 bg-[#0e131e] border-b border-white/5 font-mono text-xs">
          <div className="bg-[#121824] p-2.5 sm:p-3 rounded-xl border border-white/5">
            <span className="text-slate-400 block text-[10px] sm:text-[11px]">Total Códigos</span>
            <span className="text-lg sm:text-xl font-bold text-white mt-0.5 block">{stats.total}</span>
          </div>
          <div className="bg-[#121824] p-2.5 sm:p-3 rounded-xl border border-emerald-500/20">
            <span className="text-emerald-400 block text-[10px] sm:text-[11px] truncate">Activos / Reclamados</span>
            <span className="text-lg sm:text-xl font-bold text-emerald-400 mt-0.5 block">{stats.active}</span>
          </div>
          <div className="bg-[#121824] p-2.5 sm:p-3 rounded-xl border border-sky-500/20">
            <span className="text-sky-400 block text-[10px] sm:text-[11px]">Disponibles</span>
            <span className="text-lg sm:text-xl font-bold text-sky-400 mt-0.5 block">{stats.available}</span>
          </div>
          <div className="bg-[#121824] p-2.5 sm:p-3 rounded-xl border border-rose-500/20">
            <span className="text-rose-400 block text-[10px] sm:text-[11px]">Expirados</span>
            <span className="text-lg sm:text-xl font-bold text-rose-400 mt-0.5 block">{stats.expired}</span>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center space-x-1 px-3 sm:px-4 pt-2 sm:pt-3 border-b border-white/10 bg-[#0a0d14] overflow-x-auto scrollbar-none no-scrollbar touch-pan-x pr-6">
          <button
            onClick={() => { sounds.playClick(); setActiveTab('generator'); }}
            className={`px-3 sm:px-4 py-2 sm:py-2.5 border-b-2 text-xs font-semibold transition whitespace-nowrap cursor-pointer shrink-0 ${
              activeTab === 'generator'
                ? 'border-amber-400 text-amber-300 bg-amber-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Generador (Lotes)
          </button>

          <button
            onClick={() => { sounds.playClick(); setActiveTab('codes_list'); }}
            className={`px-3 sm:px-4 py-2 sm:py-2.5 border-b-2 text-xs font-semibold transition whitespace-nowrap cursor-pointer shrink-0 ${
              activeTab === 'codes_list'
                ? 'border-sky-400 text-sky-300 bg-sky-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Base de Datos ({codes.length})
          </button>

          <button
            onClick={() => { sounds.playClick(); setActiveTab('ai_config'); }}
            className={`px-3 sm:px-4 py-2 sm:py-2.5 border-b-2 text-xs font-semibold transition whitespace-nowrap cursor-pointer shrink-0 ${
              activeTab === 'ai_config'
                ? 'border-indigo-400 text-indigo-300 bg-indigo-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Configuración IA
          </button>
          <button
            onClick={() => { sounds.playClick(); setActiveTab('groups'); }}
            className={`px-3 sm:px-4 py-2 sm:py-2.5 border-b-2 text-xs font-semibold transition whitespace-nowrap cursor-pointer shrink-0 ${
              activeTab === 'groups'
                ? 'border-emerald-400 text-emerald-300 bg-emerald-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Grupos y Comunidad
          </button>
          <div className="w-3 shrink-0 pointer-events-none" aria-hidden="true" />
        </div>

        {/* Body Container */}
        <div className="p-3.5 sm:p-6 max-h-[70vh] sm:max-h-[55vh] overflow-y-auto overflow-x-hidden">
          
          {activeTab === 'groups' && <AdminGroups />}
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
                <table className="w-full text-left text-xs font-mono whitespace-nowrap min-w-[600px]">
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
                        {settings.isConfigured ? 'CONFIGURACIÓN GUARDADA' : 'MODO ESTADÍSTICO'}
                      </span>
                    </h4>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                      {settings.isConfigured 
                        ? `Proveedor guardado: ${settings.provider?.toUpperCase()} • Modelo: ${settings.selectedModel || 'Pendiente de seleccionar'}`
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
              <fieldset disabled={isTesting || isSaving} onChange={invalidateTest} className="min-w-0 bg-[#111723] rounded-xl p-5 border border-white/10 space-y-4 font-mono text-xs">
                
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
                            invalidateTest();
                            setProvider(p.id);
                            setBaseUrl(p.defaultBaseUrl);
                            setNewModel(p.defaultModel);
                            setCustomModelInput('');
                            invalidateTest();
                            setNewApiKey('');
                            fetchModelsForProvider(p.id, '', p.defaultBaseUrl);
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
                    <div className="flex items-center space-x-2">
                      {newApiKey && (
                        <button
                          type="button"
                          onClick={() => {
                            sounds.playClick();
                            invalidateTest();
                            setNewApiKey('');
                            const stored = getStoredAiConfig();
                            if (stored) {
                              saveStoredAiConfig({ ...stored, apiKey: '', clearApiKey: true });
                            }
                          }}
                          className="text-[10px] text-rose-400 hover:text-rose-300 font-mono underline cursor-pointer"
                        >
                          Limpiar clave
                        </button>
                      )}
                      <span className="text-[10px] text-slate-500 font-mono">
                        {newApiKey ? '● Clave lista' : ((settings.provider === provider && settings.baseUrl === baseUrl && settings.apiKeyMasked) ? `Guardada: ${settings.apiKeyMasked}` : 'No configurada')}
                      </span>
                    </div>
                  </div>

                  <div className="relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={newApiKey}
                      onChange={(e) => setNewApiKey(sanitizeApiKey(e.target.value))}
                      placeholder={(settings.provider === provider && settings.baseUrl === baseUrl && settings.apiKeyMasked) ? `Clave guardada: ${settings.apiKeyMasked}` : (PROVIDER_PRESETS[provider]?.keyPlaceholder || 'sk-...')}
                      className="w-full pl-3 pr-10 py-2 bg-[#090d15] border border-white/10 rounded-lg text-white placeholder:text-slate-600 focus:outline-none focus:border-sky-400 transition font-mono text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      title={showApiKey ? "Ocultar clave" : "Ver clave"}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white cursor-pointer"
                    >
                      {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {provider === 'agentrouter' && (
                    <div className="p-3 rounded-xl bg-sky-950/30 border border-sky-500/20 text-xs text-slate-300 space-y-1.5 font-sans mt-2">
                      <div className="flex items-center justify-between font-bold text-sky-300 text-[11px]">
                        <span className="flex items-center space-x-1">
                          <span>🔑</span>
                          <span>¿Dónde conseguir tu Token de AgentRouter?</span>
                        </span>
                        <a 
                          href="https://agentrouter.org/console/token" 
                          target="_blank" 
                          rel="noreferrer"
                          className="text-[10px] text-sky-400 hover:text-sky-200 underline font-mono"
                        >
                          Abrir consola (API 令牌) ↗
                        </a>
                      </div>
                      <p className="text-slate-400 text-[10px] leading-relaxed">
                        1. Entra a tu consola en <strong>agentrouter.org/console</strong> y haz clic en el menú izquierdo en <strong>API 令牌</strong> (API Tokens).<br />
                        2. Si no tienes uno, haz clic en <strong>添加令牌</strong> (Crear Token). Si ya tienes uno, haz clic en el botón <strong>复制</strong> (Copiar).<br />
                        3. La clave debe comenzar por <strong>sk-</strong>. Pégala aquí, dale a <strong>Guardar Configuración de IA</strong> y luego <strong>Probar Conexión</strong>.
                      </p>
                      {newApiKey && !newApiKey.startsWith('sk-') && (
                        <div className="p-1.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-mono">
                          ⚠️ Advertencia: El token ingresado no empieza por "sk-". Asegúrate de haberlo copiado desde la sección "API 令牌".
                        </div>
                      )}
                      {newApiKey && newApiKey.startsWith('sk-') && (
                        <div className="p-1.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-mono flex items-center space-x-1">
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span>Prefijo reconocido; falta verificar la conexión</span>
                        </div>
                      )}
                    </div>
                  )}

                  <p className="text-[10px] text-slate-400 flex items-center justify-between">
                    <span>{PROVIDER_PRESETS[provider]?.keyHelp}</span>
                    <span className="text-slate-500">Clave guardada en el servidor al pulsar Guardar</span>
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
                    onChange={(e) => {
                      setBaseUrl(e.target.value);
                      setNewApiKey('');
                      setAvailableModelsList([]);
                      setModelsError('');
                      modelRequest.current++;
                      setLoadingModels(false);
                    }}
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
                        <span>4. {availableModelsList.length > 0 ? `Modelos Extraídos de la API (${availableModelsList.length})` : 'Modelos Recomendados y Disponibles'}:</span>
                      </label>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                        El catálogo no confirma saldo ni permisos de uso. Compruébalos con Probar Conexión.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        sounds.playClick();
                        fetchModelsForProvider(provider, sanitizeApiKey(newApiKey) || getStoredAiConfig()?.apiKey || undefined, baseUrl);
                      }}
                      disabled={loadingModels}
                      className="px-3 py-1.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 rounded-lg text-xs font-mono font-medium flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 transition"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingModels ? 'animate-spin text-sky-400' : ''}`} />
                      <span>{loadingModels ? 'Extrayendo...' : 'Cargar Modelos'}</span>
                    </button>
                  </div>

                  {modelsError && <p role="alert" className="text-xs text-amber-300 break-words">{modelsError}</p>}
                  {provider === 'agentrouter' && <p className="text-xs text-slate-400">Puedes guardar la clave aunque el catálogo no responda. Si el proveedor bloquea el acceso, debe habilitar la integración. No cambies a otro endpoint sin confirmar que acepta tu token.</p>}
                  {/* Modelo elegido en el formulario */}
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
                      SELECCIONADO
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
                    <div className="p-4 rounded-xl bg-[#090d15] border border-white/5 space-y-3">
                      <div className="text-center space-y-1">
                        <p className="text-xs text-slate-300 font-sans">
                          Catálogo de modelos para {PROVIDER_PRESETS[provider]?.name || 'IA'}
                        </p>
                        <p className="text-[11px] text-slate-500 font-mono">
                          Selecciona directamente el modelo recomendado para tu cuenta, o pulsa "Cargar Modelos":
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        <div
                          onClick={() => {
                            sounds.playClick();
                            invalidateTest();
                            setNewModel('deepseek-v4.1');
                            setCustomModelInput('');
                          }}
                          className={`p-2.5 rounded-lg border text-left transition cursor-pointer flex items-center justify-between gap-2 ${
                            (newModel === 'deepseek-v4.1' && !customModelInput.trim())
                              ? 'bg-sky-500/15 border-sky-400/60 shadow-[0_0_12px_rgba(56,189,248,0.15)] text-white'
                              : 'bg-[#0c121e] border-white/5 text-slate-300 hover:border-white/20 hover:bg-white/5'
                          }`}
                        >
                          <div>
                            <div className="flex items-center space-x-1.5">
                              <span className="font-bold text-xs text-white">DeepSeek V4.1 Flash</span>
                              <span className="px-1.5 py-0.2 rounded bg-amber-400/10 border border-amber-400/30 text-amber-300 text-[9px] font-mono">
                                Razonamiento
                              </span>
                            </div>
                            <span className="text-[10px] text-sky-400/80 font-mono">deepseek-v4.1 (VyceAI Saldo)</span>
                          </div>
                          {(newModel === 'deepseek-v4.1' && !customModelInput.trim()) ? (
                            <span className="px-2 py-0.5 rounded bg-sky-400 text-black font-bold text-[9px] font-mono">ACTIVO</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-white/5 text-slate-400 text-[9px] font-mono">Elegir</span>
                          )}
                        </div>

                        <div
                          onClick={() => {
                            sounds.playClick();
                            invalidateTest();
                            setNewModel('deepseek-chat');
                            setCustomModelInput('');
                          }}
                          className={`p-2.5 rounded-lg border text-left transition cursor-pointer flex items-center justify-between gap-2 ${
                            (newModel === 'deepseek-chat' && !customModelInput.trim())
                              ? 'bg-sky-500/15 border-sky-400/60 shadow-[0_0_12px_rgba(56,189,248,0.15)] text-white'
                              : 'bg-[#0c121e] border-white/5 text-slate-300 hover:border-white/20 hover:bg-white/5'
                          }`}
                        >
                          <div>
                            <div className="flex items-center space-x-1.5">
                              <span className="font-bold text-xs text-white">DeepSeek Chat V3</span>
                              <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[9px] font-mono">
                                Rápido
                              </span>
                            </div>
                            <span className="text-[10px] text-sky-400/80 font-mono">deepseek-chat (Estándar)</span>
                          </div>
                          {(newModel === 'deepseek-chat' && !customModelInput.trim()) ? (
                            <span className="px-2 py-0.5 rounded bg-sky-400 text-black font-bold text-[9px] font-mono">ACTIVO</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-white/5 text-slate-400 text-[9px] font-mono">Elegir</span>
                          )}
                        </div>

                        <div
                          onClick={() => {
                            sounds.playClick();
                            invalidateTest();
                            setNewModel('deepseek-reasoner');
                            setCustomModelInput('');
                          }}
                          className={`p-2.5 rounded-lg border text-left transition cursor-pointer flex items-center justify-between gap-2 ${
                            (newModel === 'deepseek-reasoner' && !customModelInput.trim())
                              ? 'bg-sky-500/15 border-sky-400/60 shadow-[0_0_12px_rgba(56,189,248,0.15)] text-white'
                              : 'bg-[#0c121e] border-white/5 text-slate-300 hover:border-white/20 hover:bg-white/5'
                          }`}
                        >
                          <div>
                            <div className="flex items-center space-x-1.5">
                              <span className="font-bold text-xs text-white">DeepSeek R1 Reasoner</span>
                              <span className="px-1.5 py-0.2 rounded bg-amber-400/10 border border-amber-400/30 text-amber-300 text-[9px] font-mono">
                                Razonamiento Puro
                              </span>
                            </div>
                            <span className="text-[10px] text-sky-400/80 font-mono">deepseek-reasoner (R1)</span>
                          </div>
                          {(newModel === 'deepseek-reasoner' && !customModelInput.trim()) ? (
                            <span className="px-2 py-0.5 rounded bg-sky-400 text-black font-bold text-[9px] font-mono">ACTIVO</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-white/5 text-slate-400 text-[9px] font-mono">Elegir</span>
                          )}
                        </div>

                        <div
                          onClick={() => {
                            sounds.playClick();
                            invalidateTest();
                            setNewModel('deepseek-v4-flash');
                            setCustomModelInput('');
                          }}
                          className={`p-2.5 rounded-lg border text-left transition cursor-pointer flex items-center justify-between gap-2 ${
                            (newModel === 'deepseek-v4-flash' && !customModelInput.trim())
                              ? 'bg-sky-500/15 border-sky-400/60 shadow-[0_0_12px_rgba(56,189,248,0.15)] text-white'
                              : 'bg-[#0c121e] border-white/5 text-slate-300 hover:border-white/20 hover:bg-white/5'
                          }`}
                        >
                          <div>
                            <div className="flex items-center space-x-1.5">
                              <span className="font-bold text-xs text-white">DeepSeek V4 Flash</span>
                              <span className="px-1.5 py-0.2 rounded bg-sky-500/10 border border-sky-500/30 text-sky-300 text-[9px] font-mono">
                                Flash V4
                              </span>
                            </div>
                            <span className="text-[10px] text-sky-400/80 font-mono">deepseek-v4-flash</span>
                          </div>
                          {(newModel === 'deepseek-v4-flash' && !customModelInput.trim()) ? (
                            <span className="px-2 py-0.5 rounded bg-sky-400 text-black font-bold text-[9px] font-mono">ACTIVO</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-white/5 text-slate-400 text-[9px] font-mono">Elegir</span>
                          )}
                        </div>
                      </div>
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
                                invalidateTest();
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
                            invalidateTest();
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

              </fieldset>

            </div>
          )}

        </div>

      </div>
    </div>
  );
}
