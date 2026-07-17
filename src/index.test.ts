import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ProviderPluginRegistry } from 'openfox/provider'
import { register } from './index.js'
import { getDefaultModels } from './catalog/models-default.js'
import { GitHubCopilotTransportAdapter } from './transport/copilot.js'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const mockAuth = {
  getAccessContext: vi.fn(),
  getOAuthToken: vi.fn(),
  credentials: { get: vi.fn() },
  id: 'github-copilot-auth',
}

function makeContext(credentialRef?: string) {
  return {
    credentialRef,
    signal: new AbortController().signal,
    model: 'gpt-5-mini',
  } as any
}

describe('openfox-github-copilot plugin', () => {
  it('registers auth, transport, and preset through the public API', async () => {
    const configDirectory = await mkdtemp(join(tmpdir(), 'openfox-github-copilot-'))
    const registry: ProviderPluginRegistry = {
      runtime: { mode: 'production', configDirectory },
      registerAuth: vi.fn(),
      registerTransport: vi.fn(),
      registerPreset: vi.fn(),
    }
    await register(registry)
    expect(registry.registerAuth).toHaveBeenCalledWith(expect.objectContaining({ id: 'github-copilot-auth' }))
    expect(registry.registerTransport).toHaveBeenCalledWith(expect.objectContaining({ id: 'github-copilot-transport' }))
    expect(registry.registerPreset).toHaveBeenCalledWith(expect.objectContaining({ id: 'github-copilot' }))
  })
})

describe('getDefaultModels', () => {
  it('returns all 25 models with a positive contextWindow', () => {
    const models = getDefaultModels()
    expect(models.length).toBe(25)
    for (const m of models) {
      expect(m.contextWindow).toBeGreaterThan(0)
      expect(m.source).toBe('default')
    }
  })

  it('includes key models with expected context sizes', () => {
    const models = getDefaultModels()
    const byId = new Map(models.map(m => [m.id, m]))

    // GPT models (real API values)
    expect(byId.get('gpt-5-mini')?.contextWindow).toBe(128000)
    expect(byId.get('gpt-5.3-codex')?.contextWindow).toBe(272000)
    expect(byId.get('gpt-5.4')?.contextWindow).toBe(272000)
    expect(byId.get('gpt-5.4-mini')?.contextWindow).toBe(272000)
    expect(byId.get('gpt-5.4-nano')?.contextWindow).toBe(200000)
    expect(byId.get('gpt-5.5')?.contextWindow).toBe(272000)
    expect(byId.get('gpt-5.6-luna')?.contextWindow).toBe(200000)
    expect(byId.get('gpt-5.6-sol')?.contextWindow).toBe(272000)
    expect(byId.get('gpt-5.6-terra')?.contextWindow).toBe(272000)

    // Claude (real API values)
    expect(byId.get('claude-fable-5')?.contextWindow).toBe(200000)
    expect(byId.get('claude-haiku-4.5')?.contextWindow).toBe(136000)
    expect(byId.get('claude-opus-4.5')?.contextWindow).toBe(168000)
    expect(byId.get('claude-opus-4.6')?.contextWindow).toBe(200000)
    expect(byId.get('claude-opus-4.7')?.contextWindow).toBe(200000)
    expect(byId.get('claude-opus-4.8')?.contextWindow).toBe(200000)
    expect(byId.get('claude-sonnet-4.5')?.contextWindow).toBe(168000)
    expect(byId.get('claude-sonnet-4.6')?.contextWindow).toBe(200000)
    expect(byId.get('claude-sonnet-5')?.contextWindow).toBe(200000)

    // Gemini (real API values)
    expect(byId.get('gemini-2.5-pro')?.contextWindow).toBe(128000)
    expect(byId.get('gemini-3-flash')?.contextWindow).toBe(128000)
    expect(byId.get('gemini-3.1-pro')?.contextWindow).toBe(200000)
    expect(byId.get('gemini-3.5-flash')?.contextWindow).toBe(200000)

    // Others (estimated values, not returned by Copilot API)
    expect(byId.get('mai-code-1-flash')?.contextWindow).toBe(200000)
    expect(byId.get('raptor-mini')?.contextWindow).toBe(128000)
    expect(byId.get('kimi-k2.7-code')?.contextWindow).toBe(128000)
  })
})

describe('GitHubCopilotTransportAdapter.listModels', () => {
  let adapter: GitHubCopilotTransportAdapter

  beforeEach(() => {
    vi.resetAllMocks()
    mockAuth.getAccessContext.mockResolvedValue({
      headers: { Authorization: 'Bearer test-copilot-token' },
    })
    mockAuth.getOAuthToken.mockResolvedValue('test-oauth-token')
    adapter = new GitHubCopilotTransportAdapter(mockAuth as any)
  })

  afterEach(() => {
    mockFetch.mockReset()
  })

  it('returns defaults when there is no credentialRef', async () => {
    const models = await adapter.listModels(makeContext(undefined))
    expect(models.length).toBe(25)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns defaults when credentialRef is an empty string', async () => {
    const models = await adapter.listModels(makeContext(''))
    expect(models.length).toBe(25)
  })

  it('uses /models max_prompt_tokens as the primary contextWindow', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'claude-sonnet-4.5',
            capabilities: { type: 'chat', limits: { max_prompt_tokens: 180000, max_context_window_tokens: 200000 } },
          },
        ],
      }),
    })
    const models = await adapter.listModels(makeContext('cred'))
    const claude = models.find(m => m.id === 'claude-sonnet-4.5')
    expect(claude?.contextWindow).toBe(180000)
    expect(claude?.source).toBe('backend')
  })

  it('falls back to max_context_window_tokens when max_prompt_tokens is absent from /models', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'gpt-5-mini',
            capabilities: { type: 'chat', limits: { max_context_window_tokens: 400000 } },
          },
        ],
      }),
    })
    const models = await adapter.listModels(makeContext('cred'))
    const gpt5 = models.find(m => m.id === 'gpt-5-mini')
    expect(gpt5?.contextWindow).toBe(400000)
  })

  it('handles /models with capabilities.limits as null or missing', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { id: 'm1', capabilities: { type: 'chat', limits: null } },
          { id: 'm2', capabilities: { type: 'chat' } },
          { id: 'm3', capabilities: { type: 'chat', limits: { max_context_window_tokens: 300000 } } },
        ],
      }),
    })
    const models = await adapter.listModels(makeContext('cred'))
    expect(models.find(m => m.id === 'm1')?.contextWindow).toBe(128000)
    expect(models.find(m => m.id === 'm2')?.contextWindow).toBe(128000)
    expect(models.find(m => m.id === 'm3')?.contextWindow).toBe(300000)
  })

  it('includes only chat models from /models (skips embeddings, etc)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { id: 'chat-model', capabilities: { type: 'chat', limits: { max_prompt_tokens: 64000 } } },
          { id: 'embedding-model', capabilities: { type: 'embeddings' } },
          { id: 'no-cap-model' },
        ],
      }),
    })
    const models = await adapter.listModels(makeContext('cred'))
    expect(models.find(m => m.id === 'chat-model')).toBeDefined()
    expect(models.find(m => m.id === 'embedding-model')).toBeUndefined()
    expect(models.find(m => m.id === 'no-cap-model')).toBeUndefined()
  })

  it('merges /models results with defaults, preferring API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'gpt-5-mini',
            capabilities: { type: 'chat', limits: { max_prompt_tokens: 99999 } },
          },
        ],
      }),
    })
    const models = await adapter.listModels(makeContext('cred'))
    expect(models.length).toBe(25)
    const gpt5 = models.find(m => m.id === 'gpt-5-mini')
    expect(gpt5?.contextWindow).toBe(99999)
    const claude = models.find(m => m.id === 'claude-sonnet-4.5')
    expect(claude?.contextWindow).toBe(168000)
  })

  it('uses GitHub Catalog as fallback when /models returns nothing', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: 'gpt-5-mini', limits: { max_input_tokens: 256000 } },
      ],
    })
    const models = await adapter.listModels(makeContext('cred'))
    const gpt5 = models.find(m => m.id === 'gpt-5-mini')
    expect(gpt5?.contextWindow).toBe(256000)
    expect(gpt5?.source).toBe('backend')
  })

  it('handles GitHub Catalog IDs with org/ prefix by stripping it', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: 'github/gpt-5-mini', limits: { max_input_tokens: 200000 } },
      ],
    })
    const models = await adapter.listModels(makeContext('cred'))
    const gpt5 = models.find(m => m.id === 'gpt-5-mini')
    expect(gpt5).toBeDefined()
    expect(gpt5?.contextWindow).toBe(200000)
  })

  it('handles GitHub Catalog models with missing limits gracefully', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: 'no-limits-model', name: 'No Limits' },
        { id: 'partial-limits-model', name: 'Partial', limits: {} },
        { id: 'null-limits-model', name: 'Null Limits', limits: null },
      ],
    })
    const models = await adapter.listModels(makeContext('cred'))
    expect(models.find(m => m.id === 'no-limits-model')?.contextWindow).toBe(200000)
    expect(models.find(m => m.id === 'partial-limits-model')?.contextWindow).toBe(200000)
    expect(models.find(m => m.id === 'null-limits-model')?.contextWindow).toBe(200000)
  })

  it('falls back to defaults when both /models and GitHub Catalog fail', async () => {
    mockFetch.mockRejectedValue(new Error('network error'))
    const models = await adapter.listModels(makeContext('cred'))
    expect(models.length).toBe(25)
    for (const m of models) {
      expect(m.source).toBe('default')
    }
  })

  it('falls back to defaults when /models returns nothing and catalog returns malformed', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ invalid: true }) })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ wrapped: true }),
    })
    const models = await adapter.listModels(makeContext('cred'))
    expect(models.length).toBe(25)
  })

  it('falls back to defaults when access context fails', async () => {
    mockAuth.getAccessContext.mockRejectedValue(new Error('no token'))
    const models = await adapter.listModels(makeContext('cred'))
    expect(models.length).toBe(25)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
