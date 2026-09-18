/**
 * aiProviders.js
 * Configuración y presets de proveedores de IA para Picks777.
 * Soporta modelos estándar y modelos avanzados de razonamiento
 * (GPT-5 / o1 / o3-mini, Claude Opus / Sonnet Thinking, GLM-5.2 Fast, DeepSeek R1 / Reasoner).
 */

export const PROVIDER_PRESETS = {
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    icon: '🌐',
    badge: '400+ Modelos',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'nvidia/nemotron-3.5-lightning:free',
    keyPlaceholder: 'sk-or-v1-...',
    keyHelp: 'Obtén tu clave gratuita en openrouter.ai/keys'
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    icon: '🔷',
    badge: 'Google AI Studio',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.0-flash',
    keyPlaceholder: 'AIzaSy...',
    keyHelp: 'Obtén tu clave oficial en aistudio.google.com/apikey'
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
    icon: '⚡',
    badge: 'Inferencia LPU',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    keyPlaceholder: 'gsk_...',
    keyHelp: 'Obtén tu clave en console.groq.com/keys'
  },
  agentrouter: {
    id: 'agentrouter',
    name: 'Agent Router',
    icon: '🤖',
    badge: 'Multi-LLM Gateway',
    defaultBaseUrl: 'https://agentrouter.org/v1',
    defaultModel: 'deepseek-v4-flash',
    keyPlaceholder: 'sk-...',
    keyHelp: 'Compatible con agentrouter.org (DeepSeek V4, Claude, GPT)'
  },
  custom: {
    id: 'custom',
    name: 'Personalizado / 3ros',
    icon: '🛠️',
    badge: 'Cualquier API OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    keyPlaceholder: 'sk-...',
    keyHelp: 'Compatible con AgentRouter, GLM, Ollama, Together AI, Mistral, Perplexity o servidores privados'
  }
};

/**
 * Modelos destacados de razonamiento rápido y profundo
 */
export const POPULAR_REASONING_MODELS = [
  { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash (AgentRouter)', isReasoning: true },
  { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1 (Razonamiento Puro)', isReasoning: true },
  { id: 'openai/o3-mini', name: 'OpenAI o3-mini (Razonamiento STEM/Cuantitativo)', isReasoning: true },
  { id: 'anthropic/claude-3.7-sonnet:thinking', name: 'Claude 3.7 Sonnet Thinking (Híbrido)', isReasoning: true },
  { id: 'thudm/glm-4-9b-chat', name: 'GLM-4 / GLM-5.2 Fast (Zhipu AI)', isReasoning: true },
  { id: 'nvidia/nemotron-3.5-lightning:free', name: 'NVIDIA Nemotron 3.5 Lightning [GRATIS]', isFree: true },
  { id: 'google/gemini-2.0-flash-001', name: 'Google Gemini 2.0 Flash (Ultra Rápido)', isFree: false },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Meta Llama 3.3 70B [GRATIS]', isFree: true }
];
