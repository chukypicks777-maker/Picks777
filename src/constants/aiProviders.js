/**
 * aiProviders.js
 * Configuración y presets de proveedores de IA para Picks777.
 * Soporta modelos estándar y modelos avanzados de razonamiento
 * (VyceAI / Terceros, AgentRouter, DeepSeek R1, Groq, Gemini).
 */

export const PROVIDER_PRESETS = {
  custom: {
    id: 'custom',
    name: 'API Terceros / VyceAI',
    icon: '⚡',
    badge: 'API con Saldo',
    defaultBaseUrl: 'https://vyceai.com/v1',
    defaultModel: 'deepseek-v4.1',
    keyPlaceholder: 'sk-...',
    keyHelp: 'API compatible con OpenAI / Chat Completions (VyceAI, endpoint personalizado con saldo).'
  },
  agentrouter: {
    id: 'agentrouter',
    name: 'Agent Router',
    icon: '🤖',
    badge: 'Multi-LLM Gateway',
    defaultBaseUrl: 'https://agentrouter.org/v1',
    defaultModel: 'deepseek-v4-flash',
    keyPlaceholder: 'sk-...',
    keyHelp: 'Usa la URL asociada a tu token (agentrouter.org/v1 o co.agentrouter.org/v1).'
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek / Chinos',
    icon: '🇨🇳',
    badge: 'DeepSeek & GLM',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    keyPlaceholder: 'sk-...',
    keyHelp: 'Compatible con DeepSeek (Chat/R1), Zhipu GLM, Alibaba Qwen y Moonshot'
  },
  groq: {
    id: 'groq',
    name: 'Groq (Ultra Rápido)',
    icon: '🚀',
    badge: 'Inferencia LPU',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    keyPlaceholder: 'gsk_...',
    keyHelp: 'Obtén tu clave en console.groq.com/keys'
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    icon: '🔷',
    badge: 'Google AI Studio',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.5-flash',
    keyPlaceholder: 'AIzaSy...',
    keyHelp: 'Obtén tu clave oficial en aistudio.google.com/apikey'
  }
};

/**
 * Modelos destacados de razonamiento rápido y profundo
 */
export const POPULAR_REASONING_MODELS = [
  { id: 'deepseek-v4.1', name: 'DeepSeek V4.1 Flash (Terceros / VyceAI)', isReasoning: true },
  { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash (AgentRouter)', isReasoning: true },
  { id: 'deepseek-chat', name: 'DeepSeek Chat (V3)', isReasoning: false },
  { id: 'deepseek-reasoner', name: 'DeepSeek R1 / Reasoner (Razonamiento Puro)', isReasoning: true },
  { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B (Groq Inferencia)', isFree: false },
  { id: 'gemini-2.0-flash', name: 'Google Gemini 2.0 Flash (Ultra Rápido)', isFree: false },
  { id: 'openai/o3-mini', name: 'OpenAI o3-mini (Razonamiento STEM)', isReasoning: true },
  { id: 'anthropic/claude-3.7-sonnet:thinking', name: 'Claude 3.7 Sonnet Thinking (Híbrido)', isReasoning: true }
];
