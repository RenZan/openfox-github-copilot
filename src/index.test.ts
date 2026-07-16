import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { ProviderPluginRegistry } from 'openfox/provider'
import { register } from './index.js'

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
