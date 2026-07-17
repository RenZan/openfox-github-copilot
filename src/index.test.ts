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
  it('returns all 21 models with a positive contextWindow', () => {
    const models = getDefaultModels()
    expect(models.length).toBe(21)
    for (const m of models) {
      expect(m.contextWindow).toBeGreaterThan(0)
      expect(m.source).toBe('default')
    }
  })

  it('includes key models with expected context sizes', () => {
    const models = getDefaultModels()
    const byId = new Map(models.map(m => [m.id, m]))

    // Chat completion models (real API values)
    expect(byId.get('gpt-5-mini')?.contextWindow).toBe(128000)
    expect(byId.get('gpt-5.4')?.contextWindow).toBe(272000)
    expect(byId.get('gpt-5.4-nano')?.contextWindow).toBe(200000)

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

    // Gemini
    expect(byId.get('gemini-3.1-pro')?.contextWindow).toBe(200000)
    expect(byId.get('gemini-3.5-flash')?.contextWindow).toBe(200000)

    // Trajectory compaction
    expect(byId.get('trajectory-compaction')?.contextWindow).toBe(245760)

    // Responses endpoint models
    expect(byId.get('gpt-5.3-codex')?.contextWindow).toBe(272000)
    expect(byId.get('gpt-5.4-mini')?.contextWindow).toBe(272000)
    expect(byId.get('gpt-5.5')?.contextWindow).toBe(272000)
    expect(byId.get('gpt-5.6-luna')?.contextWindow).toBe(200000)
    expect(byId.get('gpt-5.6-sol')?.contextWindow).toBe(272000)
    expect(byId.get('gpt-5.6-terra')?.contextWindow).toBe(272000)

    // Responses models should have requestBody.endpoint
    for (const id of ['gpt-5.3-codex', 'gpt-5.4-mini', 'gpt-5.5', 'gpt-5.6-luna', 'gpt-5.6-sol', 'gpt-5.6-terra']) {
      expect(byId.get(id)?.requestBody?.endpoint).toBe('/responses')
    }

    // Chat models should NOT have requestBody.endpoint
    for (const id of ['gpt-5-mini', 'gpt-5.4', 'claude-sonnet-4.6', 'gemini-3.5-flash']) {
      expect(byId.get(id)?.requestBody?.endpoint).toBeUndefined()
    }

    // Retired / unknown models removed
    expect(byId.has('gpt-5.2')).toBe(false)
    expect(byId.has('gemini-2.5-pro')).toBe(false)
    expect(byId.has('gemini-3-flash')).toBe(false)
    expect(byId.has('mai-code-1-flash')).toBe(false)
    expect(byId.has('raptor-mini')).toBe(false)
    expect(byId.has('kimi-k2.7-code')).toBe(false)
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
    expect(models.length).toBe(21)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns defaults when credentialRef is an empty string', async () => {
    const models = await adapter.listModels(makeContext(''))
    expect(models.length).toBe(21)
  })

  it('uses /models max_prompt_tokens as the primary contextWindow', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'claude-sonnet-4.5',
            supported_endpoints: ['/chat/completions'],
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
            supported_endpoints: ['/chat/completions'],
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
          { id: 'm1', supported_endpoints: ['/chat/completions'], capabilities: { type: 'chat', limits: null } },
          { id: 'm2', supported_endpoints: ['/chat/completions'], capabilities: { type: 'chat' } },
          { id: 'm3', supported_endpoints: ['/chat/completions'], capabilities: { type: 'chat', limits: { max_context_window_tokens: 300000 } } },
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
          { id: 'chat-model', supported_endpoints: ['/chat/completions'], capabilities: { type: 'chat', limits: { max_prompt_tokens: 64000 } } },
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
            supported_endpoints: ['/chat/completions'],
            capabilities: { type: 'chat', limits: { max_prompt_tokens: 99999 } },
          },
        ],
      }),
    })
    const models = await adapter.listModels(makeContext('cred'))
    expect(models.length).toBe(21)
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
    expect(models.length).toBe(21)
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
    expect(models.length).toBe(21)
  })

  it('falls back to defaults when access context fails', async () => {
    mockAuth.getAccessContext.mockRejectedValue(new Error('no token'))
    const models = await adapter.listModels(makeContext('cred'))
    expect(models.length).toBe(21)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('GitHubCopilotTransportAdapter — items from spec', () => {
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

  // P1: Dynamic routing — models with supported_endpoints=['/responses'] without /chat/completions routed to /responses
  it('P1: /models returns a responses-only model — requestBody.endpoint is set to /responses', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'responses-only-model',
            supported_endpoints: ['/responses'],
            capabilities: { type: 'chat', limits: { max_prompt_tokens: 64000 } },
          },
        ],
      }),
    })
    const models = await adapter.listModels(makeContext('cred'))
    const m = models.find(x => x.id === 'responses-only-model')
    expect(m).toBeDefined()
    expect(m?.requestBody?.endpoint).toBe('/responses')
  })

  it('P1: /models returns a chat+responses model — default endpoint used (no requestBody override)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'dual-model',
            supported_endpoints: ['/chat/completions', '/responses'],
            capabilities: { type: 'chat', limits: { max_prompt_tokens: 64000 } },
          },
        ],
      }),
    })
    const models = await adapter.listModels(makeContext('cred'))
    const m = models.find(x => x.id === 'dual-model')
    expect(m).toBeDefined()
    expect(m?.requestBody?.endpoint).toBeUndefined()
  })

  it('P1: /models returns a chat-only model — no requestBody override', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'chat-only-model',
            supported_endpoints: ['/chat/completions'],
            capabilities: { type: 'chat', limits: { max_prompt_tokens: 64000 } },
          },
        ],
      }),
    })
    const models = await adapter.listModels(makeContext('cred'))
    const m = models.find(x => x.id === 'chat-only-model')
    expect(m).toBeDefined()
    expect(m?.requestBody?.endpoint).toBeUndefined()
  })

  // P2: GitHub Catalog models get requestBody.endpoint='/chat/completions' by default
  it('P2: GitHub Catalog models receive endpoint=/chat/completions by default', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: 'gpt-5-mini', limits: { max_input_tokens: 256000 } },
      ],
    })
    const models = await adapter.listModels(makeContext('cred'))
    const gpt5 = models.find(m => m.id === 'gpt-5-mini')
    expect(gpt5?.requestBody?.endpoint).toBe('/chat/completions')
    expect(gpt5?.source).toBe('backend')
  })

  // P2: Fallback model 'gpt-4o' replaced by 'gpt-5-mini'
  it('P2: stream() uses gpt-5-mini when no model is specified (fallback)', async () => {
    mockAuth.getAccessContext.mockResolvedValue({
      headers: { Authorization: 'Bearer test-copilot-token' },
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"hello"}}]}\n\n'))
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
          controller.close()
        },
      }),
      headers: new Headers({ 'content-type': 'text/event-stream' }),
    })

    const ctx = { credentialRef: 'cred', signal: new AbortController().signal } as any
    const request = {
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
      signal: new AbortController().signal,
    } as any
    const events: any[] = []
    for await (const ev of adapter.stream(request, ctx)) {
      events.push(ev)
    }
    const fetchCall = mockFetch.mock.calls.find((c: any) => c[0] === 'https://api.githubcopilot.com/chat/completions')
    expect(fetchCall).toBeDefined()
    const body = JSON.parse(fetchCall![1].body)
    expect(body.model).toBe('gpt-5-mini')
  })

  // P1: Multi-turn tool calls /responses — tool responses sent as user role, tool_calls omitted
  it('P1: streamResponses sends tool responses as function_call_output items', async () => {
    mockAuth.getAccessContext.mockResolvedValue({
      headers: { Authorization: 'Bearer test-copilot-token' },
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder()
          controller.enqueue(encoder.encode(
            'event: response.created\ndata: {"response":{"id":"resp-1"}}\n\n' +
            'event: response.output_text.delta\ndata: {"delta":"Hello"}\n\n' +
            'event: response.completed\ndata: {"response":{"id":"resp-1","usage":{"input_tokens":10,"output_tokens":5}}}\n\n'
          ))
          controller.close()
        },
      }),
      headers: new Headers({ 'content-type': 'text/event-stream' }),
    })

    const ctx = { credentialRef: 'cred', signal: new AbortController().signal, model: 'gpt-5.4-mini' } as any
    const request = {
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: '', toolCalls: [{ id: 'tc1', name: 'get_weather', arguments: { city: 'Paris' } }] },
        { role: 'tool', content: '20°C', toolCallId: 'tc1' },
      ],
      signal: new AbortController().signal,
    } as any
    const events: any[] = []
    for await (const ev of adapter.stream(request, ctx)) {
      events.push(ev)
    }
    const fetchCall = mockFetch.mock.calls.find((c: any) => c[0] === 'https://api.githubcopilot.com/responses')
    expect(fetchCall).toBeDefined()
    const body = JSON.parse(fetchCall![1].body)

    expect(body.input.find((m: any) => m.role === 'assistant')).toBeUndefined()

    const toolMsg = body.input.find((m: any) => m.role === 'user' && m.content.includes('[Tool result for'))
    expect(toolMsg).toBeDefined()
    expect(toolMsg.content).toContain('tc1')
    expect(toolMsg.content).toContain('20°C')
  })

  // P1: Flush EOF — last event has data line with trailing \n but no \n\n (empty line)
  //      This means data is parsed into currentData, but never flushed by an empty line
  it('P1: streamResponses flushes remaining event on EOF (data line parsed, no empty line terminator)', async () => {
    mockAuth.getAccessContext.mockResolvedValue({
      headers: { Authorization: 'Bearer test-copilot-token' },
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder()
          // No trailing \n\n after the last data line — only \n
          // This way the data line is parsed into currentData but
          // the empty line trigger never fires; EOF flush must pick it up
          controller.enqueue(encoder.encode(
            'event: response.created\ndata: {"response":{"id":"resp-2"}}\n\n' +
            'event: response.output_text.delta\ndata: {"delta":"Hello from flush"}\n\n' +
            'event: response.completed\ndata: {"response":{"id":"resp-2","usage":{"input_tokens":5,"output_tokens":3}}}\n'
          ))
          controller.close()
        },
      }),
      headers: new Headers({ 'content-type': 'text/event-stream' }),
    })

    const ctx = { credentialRef: 'cred', signal: new AbortController().signal, model: 'gpt-5.4-mini' } as any
    const request = {
      messages: [{ role: 'user', content: 'hi' }],
      signal: new AbortController().signal,
    } as any
    const events: any[] = []
    for await (const ev of adapter.stream(request, ctx)) {
      events.push(ev)
    }
    expect(events.some(e => e.type === 'text_delta' && e.content === 'Hello from flush')).toBe(true)
    const doneEvent = events.find(e => e.type === 'done')
    expect(doneEvent).toBeDefined()
    expect(doneEvent.response.id).toBe('resp-2')
    expect(doneEvent.response.usage).toEqual({ promptTokens: 5, completionTokens: 3, totalTokens: 8 })
  })

  // P2: Usage non-gonflé — input_tokens/output_tokens prioritized over token_details
  it('P2: processResponsesEvent prioritizes input_tokens over token_details', async () => {
    mockAuth.getAccessContext.mockResolvedValue({
      headers: { Authorization: 'Bearer test-copilot-token' },
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder()
          controller.enqueue(encoder.encode(
            'event: response.created\ndata: {"response":{"id":"resp-3"}}\n\n' +
            'event: response.output_text.delta\ndata: {"delta":"world"}\n\n' +
            'event: response.completed\ndata: {"response":{"id":"resp-3","usage":{"input_tokens":99,"output_tokens":88,"token_details":[{"token_type":"input","token_count":1},{"token_type":"output","token_count":2}]}}}\n\n'
          ))
          controller.close()
        },
      }),
      headers: new Headers({ 'content-type': 'text/event-stream' }),
    })

    const ctx = { credentialRef: 'cred', signal: new AbortController().signal, model: 'gpt-5.4-mini' } as any
    const request = {
      messages: [{ role: 'user', content: 'hi' }],
      signal: new AbortController().signal,
    } as any
    const events: any[] = []
    for await (const ev of adapter.stream(request, ctx)) {
      events.push(ev)
    }
    const doneEvent = events.find(e => e.type === 'done')
    expect(doneEvent?.response.usage.promptTokens).toBe(99)
    expect(doneEvent?.response.usage.completionTokens).toBe(88)
  })

  it('P2: processResponsesEvent falls back to token_details when input_tokens missing', async () => {
    mockAuth.getAccessContext.mockResolvedValue({
      headers: { Authorization: 'Bearer test-copilot-token' },
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder()
          controller.enqueue(encoder.encode(
            'event: response.created\ndata: {"response":{"id":"resp-4"}}\n\n' +
            'event: response.output_text.delta\ndata: {"delta":"fallback"}\n\n' +
            'event: response.completed\ndata: {"response":{"id":"resp-4","usage":{"token_details":[{"token_type":"input","token_count":7},{"token_type":"output","token_count":3}]}}}\n\n'
          ))
          controller.close()
        },
      }),
      headers: new Headers({ 'content-type': 'text/event-stream' }),
    })

    const ctx = { credentialRef: 'cred', signal: new AbortController().signal, model: 'gpt-5.4-mini' } as any
    const request = {
      messages: [{ role: 'user', content: 'hi' }],
      signal: new AbortController().signal,
    } as any
    const events: any[] = []
    for await (const ev of adapter.stream(request, ctx)) {
      events.push(ev)
    }
    const doneEvent = events.find(e => e.type === 'done')
    expect(doneEvent?.response.usage.promptTokens).toBe(7)
    expect(doneEvent?.response.usage.completionTokens).toBe(3)
  })

  // P1: Tool calls multi-round — multiple rounds of tool calls
  it('P1: streamResponses handles multi-round tool calls (function_call + arguments delta)', async () => {
    mockAuth.getAccessContext.mockResolvedValue({
      headers: { Authorization: 'Bearer test-copilot-token' },
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder()
          controller.enqueue(encoder.encode(
            'event: response.created\ndata: {"response":{"id":"resp-tc1"}}\n\n' +
            'event: response.output_item.added\ndata: {"item":{"id":"fc1","type":"function_call","name":"get_weather"}}\n\n' +
            'event: response.function_call_arguments.delta\ndata: {"delta":"{\\"city\\":\\""}\n\n' +
            'event: response.function_call_arguments.delta\ndata: {"delta":"Paris\\"}"}\n\n' +
            'event: response.output_item.done\ndata: {"item":{"id":"fc1","type":"function_call","name":"get_weather","arguments":"{\\"city\\":\\"Paris\\"}"}}\n\n' +
            'event: response.completed\ndata: {"response":{"id":"resp-tc1","usage":{"input_tokens":10,"output_tokens":20}}}\n\n'
          ))
          controller.close()
        },
      }),
      headers: new Headers({ 'content-type': 'text/event-stream' }),
    })

    const ctx = { credentialRef: 'cred', signal: new AbortController().signal, model: 'gpt-5.4-mini' } as any
    const request = {
      messages: [{ role: 'user', content: 'weather in Paris?' }],
      tools: [
        {
          type: 'function' as const,
          function: { name: 'get_weather', description: 'Get weather', parameters: { type: 'object', properties: { city: { type: 'string' } } } },
        },
      ],
      toolChoice: 'auto' as const,
      signal: new AbortController().signal,
    } as any
    const events: any[] = []
    for await (const ev of adapter.stream(request, ctx)) {
      events.push(ev)
    }
    const doneEvent = events.find(e => e.type === 'done')
    expect(doneEvent).toBeDefined()
    expect(doneEvent.response.toolCalls).toBeDefined()
    expect(doneEvent.response.toolCalls.length).toBe(1)
    expect(doneEvent.response.toolCalls[0].name).toBe('get_weather')
    expect(doneEvent.response.toolCalls[0].arguments).toEqual({ city: 'Paris' })
    expect(doneEvent.response.finishReason).toBe('tool_calls')
  })

  // Criterion 3: Chat completions — tool_call_delta streaming
  it('P1: streamChatCompletions yields tool_call_delta events', async () => {
    mockAuth.getAccessContext.mockResolvedValue({
      headers: { Authorization: 'Bearer test-copilot-token' },
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder()
          controller.enqueue(encoder.encode(
            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"get_weather","arguments":""}}]}}]}\n\n' +
            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"city\\":\\"Paris\\"}"}}]}}]}\n\n' +
            'data: {"choices":[{"delta":{"content":""},"finish_reason":"tool_calls"}]}\n\n' +
            'data: [DONE]\n\n'
          ))
          controller.close()
        },
      }),
      headers: new Headers({ 'content-type': 'text/event-stream' }),
    })

    const ctx = { credentialRef: 'cred', signal: new AbortController().signal } as any
    const request = {
      messages: [{ role: 'user', content: 'weather' }],
      signal: new AbortController().signal,
    } as any
    const events: any[] = []
    for await (const ev of adapter.stream(request, ctx)) {
      events.push(ev)
    }
    expect(events.some(e => e.type === 'tool_call_delta')).toBe(true)
    const toolDeltas = events.filter(e => e.type === 'tool_call_delta')
    expect(toolDeltas.length).toBeGreaterThanOrEqual(2)

    const doneEvent = events.find(e => e.type === 'done')
    expect(doneEvent?.response.toolCalls).toBeDefined()
    expect(doneEvent?.response.toolCalls[0].name).toBe('get_weather')
    expect(doneEvent?.response.finishReason).toBe('tool_calls')
  })

  // Criterion 3: Chat completions — partial EOF without trailing \n
  it('P1: streamChatCompletions processes last data line on EOF without \\n', async () => {
    mockAuth.getAccessContext.mockResolvedValue({
      headers: { Authorization: 'Bearer test-copilot-token' },
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder()
          controller.enqueue(encoder.encode(
            'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n' +
            'data: {"choices":[{"delta":{"content":" EOF"}}]}\n\n' +
            'data: {"id":"resp-eof","choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}\n\n'
          ))
          controller.close()
        },
      }),
      headers: new Headers({ 'content-type': 'text/event-stream' }),
    })

    const ctx = { credentialRef: 'cred', signal: new AbortController().signal } as any
    const request = {
      messages: [{ role: 'user', content: 'hi' }],
      signal: new AbortController().signal,
    } as any
    const events: any[] = []
    for await (const ev of adapter.stream(request, ctx)) {
      events.push(ev)
    }
    const doneEvent = events.find(e => e.type === 'done')
    expect(doneEvent).toBeDefined()
    expect(doneEvent.response.content).toContain('EOF')
    expect(doneEvent.response.usage.totalTokens).toBe(5)
  })

  // Criterion 3: Chat completions — partial EOF with fragment in buffer (no trailing \n)
  it('P1: streamChatCompletions parses fragmented last data line without \\n at EOF', async () => {
    mockAuth.getAccessContext.mockResolvedValue({
      headers: { Authorization: 'Bearer test-copilot-token' },
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder()
          // Data chunk without trailing \n — simulates TCP fragmentation
          controller.enqueue(encoder.encode(
            'data: {"choices":[{"delta":{"content":"first"}}]}\n\n' +
            'data: {"choices":[{"delta":{"content":" chunk"}}]}\n\n'
          ))
          controller.enqueue(encoder.encode(
            'data: {"id":"resp-frag","choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"completion_tokens":2,"total_tokens":4}}\n\n'
          ))
          controller.close()
        },
      }),
      headers: new Headers({ 'content-type': 'text/event-stream' }),
    })

    const ctx = { credentialRef: 'cred', signal: new AbortController().signal } as any
    const request = {
      messages: [{ role: 'user', content: 'hi' }],
      signal: new AbortController().signal,
    } as any
    const events: any[] = []
    for await (const ev of adapter.stream(request, ctx)) {
      events.push(ev)
    }
    const doneEvent = events.find(e => e.type === 'done')
    expect(doneEvent).toBeDefined()
    expect(doneEvent.response.content).toContain('first')
    expect(doneEvent.response.id).toBe('resp-frag')
    expect(doneEvent.response.usage.totalTokens).toBe(4)
  })
})
