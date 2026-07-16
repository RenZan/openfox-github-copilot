import type { ModelConfig } from 'openfox/provider'

export function getDefaultModels(): ModelConfig[] {
  return [
    { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000, source: 'default' },
    { id: 'claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', contextWindow: 200000, source: 'default' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', contextWindow: 1048576, source: 'default' },
    { id: 'o1-mini', name: 'o1-mini', contextWindow: 128000, source: 'default' },
  ]
}
