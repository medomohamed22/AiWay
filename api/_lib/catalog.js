export const MODELS = Object.freeze([
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI', type: 'text', cost: 1 },
  { id: 'openai/gpt-4.1-mini', name: 'GPT-4.1 Mini', provider: 'OpenAI', type: 'text', cost: 2 },
  { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', provider: 'Anthropic', type: 'text', cost: 3 },
  { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'Google', type: 'text', cost: 1 },
  { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'Google', type: 'text', cost: 3 },
  { id: 'deepseek/deepseek-chat-v3-0324', name: 'DeepSeek V3', provider: 'DeepSeek', type: 'text', cost: 1 },
  { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1', provider: 'DeepSeek', type: 'text', cost: 2 },
  { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', provider: 'Meta', type: 'text', cost: 2 },
  { id: 'mistralai/mistral-small-3.1-24b-instruct', name: 'Mistral Small 3.1', provider: 'Mistral', type: 'text', cost: 1 },
  { id: 'google/gemini-2.5-flash-image-preview', name: 'Gemini Image', provider: 'Google', type: 'image', cost: 4 }
]);

export const PACKAGES = Object.freeze([
  { id: 'starter', usd: 1, tokens: 150 },
  { id: 'value', usd: 5, tokens: 800 },
  { id: 'pro', usd: 10, tokens: 1700 }
]);

export function modelById(id) { return MODELS.find((model) => model.id === id) || null; }
export function packageById(id) { return PACKAGES.find((pkg) => pkg.id === id) || null; }
