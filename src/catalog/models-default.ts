import type { ModelConfig } from 'openfox/provider'

export function getDefaultModels(): ModelConfig[] {
  return [
    { id: 'gpt-5-mini', name: 'GPT-5 mini', contextWindow: 128000, source: 'default' },
    { id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex', contextWindow: 272000, source: 'default' },
    { id: 'gpt-5.4', name: 'GPT-5.4', contextWindow: 272000, source: 'default' },
    { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', contextWindow: 272000, source: 'default' },
    { id: 'gpt-5.4-nano', name: 'GPT-5.4 Nano', contextWindow: 200000, source: 'default' },
    { id: 'gpt-5.5', name: 'GPT-5.5', contextWindow: 272000, source: 'default' },
    { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', contextWindow: 200000, source: 'default' },
    { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', contextWindow: 272000, source: 'default' },
    { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra', contextWindow: 272000, source: 'default' },
    { id: 'claude-fable-5', name: 'Claude Fable 5', contextWindow: 200000, source: 'default' },
    { id: 'claude-haiku-4.5', name: 'Claude Haiku 4.5', contextWindow: 136000, source: 'default' },
    { id: 'claude-opus-4.5', name: 'Claude Opus 4.5', contextWindow: 168000, source: 'default' },
    { id: 'claude-opus-4.6', name: 'Claude Opus 4.6', contextWindow: 200000, source: 'default' },
    { id: 'claude-opus-4.7', name: 'Claude Opus 4.7', contextWindow: 200000, source: 'default' },
    { id: 'claude-opus-4.8', name: 'Claude Opus 4.8', contextWindow: 200000, source: 'default' },
    { id: 'claude-sonnet-4.5', name: 'Claude Sonnet 4.5', contextWindow: 168000, source: 'default' },
    { id: 'claude-sonnet-4.6', name: 'Claude Sonnet 4.6', contextWindow: 200000, source: 'default' },
    { id: 'claude-sonnet-5', name: 'Claude Sonnet 5', contextWindow: 200000, source: 'default' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', contextWindow: 128000, source: 'default' },
    { id: 'gemini-3-flash', name: 'Gemini 3 Flash', contextWindow: 128000, source: 'default' },
    { id: 'gemini-3.1-pro', name: 'Gemini 3.1 Pro', contextWindow: 200000, source: 'default' },
    { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', contextWindow: 200000, source: 'default' },
    { id: 'mai-code-1-flash', name: 'MAI-Code-1-Flash', contextWindow: 200000, source: 'default' },
    { id: 'raptor-mini', name: 'Raptor mini', contextWindow: 128000, source: 'default' },
    { id: 'kimi-k2.7-code', name: 'Kimi K2.7 Code', contextWindow: 128000, source: 'default' },
  ]
}
