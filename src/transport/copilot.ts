import type {
  ProviderTransportAdapter,
  ProviderRequestContext,
  ModelConfig,
  LLMCompletionRequest,
  LLMCompletionResponse,
  LLMStreamEvent,
  ToolCall,
  LLMMessage,
  LLMToolDefinition,
} from 'openfox/provider'
import { GitHubCopilotAuthAdapter } from '../auth/github-browser-auth.js'
import { getDefaultModels } from '../catalog/models-default.js'

export class GitHubCopilotTransportAdapter implements ProviderTransportAdapter {
  readonly id = 'github-copilot-transport'

  constructor(private readonly auth: GitHubCopilotAuthAdapter) {}

  async listModels(context: ProviderRequestContext): Promise<ModelConfig[]> {
    if (!context.credentialRef) return getDefaultModels()

    try {
      const access = await this.auth.getAccessContext(context.credentialRef)
      const res = await fetch('https://api.githubcopilot.com/models', {
        headers: { ...access.headers },
      })

      if (!res.ok) return getDefaultModels()

      const data = await res.json() as {
        data?: Array<{
          id: string
          name?: string
          capabilities?: { type?: string }
          limits?: { max_inputs_tokens?: number }
        }>
      }

      if (!data.data || !Array.isArray(data.data)) return getDefaultModels()

      const models: ModelConfig[] = []
      for (const m of data.data) {
        if (m.capabilities?.type === 'chat') {
          models.push({
            id: m.id,
            name: m.name || m.id,
            contextWindow: m.limits?.max_inputs_tokens || 128000,
            source: 'backend',
          })
        }
      }

      return models.length > 0 ? models : getDefaultModels()
    } catch {
      return getDefaultModels()
    }
  }

  async complete(request: LLMCompletionRequest, context: ProviderRequestContext): Promise<LLMCompletionResponse> {
    let result: LLMCompletionResponse | undefined
    for await (const event of this.stream(request, context)) {
      if (event.type === 'done') result = event.response
      if (event.type === 'error') throw new Error(event.error)
    }
    if (!result) throw new Error('Copilot response completed without a final response')
    return result
  }

  async *stream(request: LLMCompletionRequest, context: ProviderRequestContext): AsyncIterable<LLMStreamEvent> {
    if (!context.credentialRef) {
      yield { type: 'error', error: 'GitHub Copilot account is not connected' }
      return
    }

    try {
      const access = await this.auth.getAccessContext(context.credentialRef)
      const model = context.model || 'gpt-4o'

      const convertMessage = (m: LLMMessage) => {
        const base: Record<string, unknown> = {
          role: m.role,
          content: m.content === '' ? null : m.content,
        }
        if (m.role === 'assistant' && m.toolCalls?.length) {
          base.tool_calls = m.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
          }))
        }
        if (m.role === 'tool' && m.toolCallId) {
          base.tool_call_id = m.toolCallId
        }
        if (m.name) base.name = m.name
        return base
      }

      const body: Record<string, unknown> = {
        model,
        messages: request.messages.map(convertMessage),
        stream: true,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
      }
      if (request.tools?.length) {
        body.tools = request.tools.map((t: LLMToolDefinition) => ({
          type: 'function',
          function: {
            name: t.function.name,
            description: t.function.description,
            parameters: t.function.parameters,
          },
        }))
      }
      if (request.toolChoice) body.tool_choice = request.toolChoice
      if (request.reasoningEffort) body.reasoning_effort = request.reasoningEffort

      const res = await fetch('https://api.githubcopilot.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...access.headers,
        },
        body: JSON.stringify(body),
        signal: request.signal,
      })

      if (!res.ok) {
        const errorDetail = await res.text()
        yield { type: 'error', error: `GitHub Copilot API error (${res.status}): ${errorDetail}` }
        return
      }

      if (!res.body) {
        yield { type: 'error', error: 'Response body is empty' }
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffer = ''
      let fullContent = ''
      let fullThinking = ''
      const toolCalls = new Map<number, { id: string; name: string; arguments: string }>()
      let finishReason: LLMCompletionResponse['finishReason'] = 'stop'
      let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
      let responseId = 'copilot-response-' + crypto.randomUUID()

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            const cleaned = line.trim()
            if (!cleaned) continue
            if (cleaned === 'data: [DONE]') continue

            if (cleaned.startsWith('data: ')) {
              const dataStr = cleaned.slice(6)
              try {
                const parsed = JSON.parse(dataStr) as {
                  id?: string
                  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
                  choices?: Array<{
                    finish_reason?: string | null
                    delta?: {
                      content?: string | null
                      reasoning_content?: string | null
                      reasoning?: string | null
                      thinking?: string | null
                      tool_calls?: Array<{
                        index: number
                        id?: string
                        function?: { name?: string; arguments?: string }
                      }>
                    }
                  }>
                }

                if (parsed.id) responseId = parsed.id
                if (parsed.usage) {
                  usage = {
                    promptTokens: parsed.usage.prompt_tokens ?? 0,
                    completionTokens: parsed.usage.completion_tokens ?? 0,
                    totalTokens: parsed.usage.total_tokens ?? 0,
                  }
                }

                const choice = parsed.choices?.[0]
                if (!choice) continue

                if (choice.finish_reason) {
                  switch (choice.finish_reason) {
                    case 'stop': finishReason = 'stop'; break
                    case 'tool_calls': finishReason = 'tool_calls'; break
                    case 'length': finishReason = 'length'; break
                    case 'content_filter': finishReason = 'content_filter'; break
                  }
                }

                const delta = choice.delta
                if (!delta) continue

                const thinking = delta.reasoning_content || delta.reasoning || delta.thinking
                if (thinking) {
                  fullThinking += thinking
                  yield { type: 'thinking_delta', content: thinking }
                }

                if (delta.content) {
                  fullContent += delta.content
                  yield { type: 'text_delta', content: delta.content }
                }

                if (delta.tool_calls) {
                  for (const tc of delta.tool_calls) {
                    const existing = toolCalls.get(tc.index)
                    if (!existing) {
                      toolCalls.set(tc.index, {
                        id: tc.id ?? '',
                        name: tc.function?.name ?? '',
                        arguments: tc.function?.arguments ?? '',
                      })
                    } else {
                      if (tc.id) existing.id = tc.id
                      if (tc.function?.name) existing.name += tc.function.name
                      if (tc.function?.arguments) existing.arguments += tc.function.arguments
                    }

                    yield {
                      type: 'tool_call_delta',
                      index: tc.index,
                      ...(tc.id ? { id: tc.id } : {}),
                      ...(tc.function?.name ? { name: tc.function.name } : {}),
                      ...(tc.function?.arguments ? { arguments: tc.function.arguments } : {}),
                    }
                  }
                }
              } catch {
                // Ignore parse errors on incomplete JSON chunks
              }
            }
          }
        }
      } finally {
        reader.releaseLock()
      }

      const parsedToolCalls: ToolCall[] = []
      for (const [, tc] of toolCalls) {
        try {
          parsedToolCalls.push({
            id: tc.id,
            name: tc.name,
            arguments: JSON.parse(tc.arguments) as Record<string, unknown>,
          })
        } catch (error) {
          parsedToolCalls.push({
            id: tc.id,
            name: tc.name,
            arguments: {},
            parseError: error instanceof Error ? error.message : 'Unknown JSON parse error',
            rawArguments: tc.arguments,
          })
        }
      }

      yield {
        type: 'done',
        response: {
          id: responseId,
          content: fullContent,
          ...(fullThinking && { thinkingContent: fullThinking }),
          ...(parsedToolCalls.length > 0 && { toolCalls: parsedToolCalls }),
          finishReason,
          usage,
        },
      }
    } catch (error: any) {
      yield { type: 'error', error: error.message || String(error) }
    }
  }
}
