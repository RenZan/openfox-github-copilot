import { join } from 'node:path'
import type { ProviderPluginRegistry, ProviderPreset } from 'openfox/provider'
import { FileProviderCredentialStore } from './credentials/file-credential-store.js'
import { GitHubCopilotAuthAdapter } from './auth/github-browser-auth.js'
import { GitHubCopilotTransportAdapter } from './transport/copilot.js'

const copilotPreset: ProviderPreset = {
  id: 'github-copilot',
  name: 'GitHub Copilot',
  description: 'Use your GitHub Copilot subscription via device code authentication.',
  requiresAuth: true,
  authAdapter: 'github-copilot-auth',
  transportAdapter: 'github-copilot-transport',
  defaults: {
    name: 'GitHub Copilot',
    url: 'https://api.githubcopilot.com',
    backend: 'openai',
  },
  connectLabel: 'Connect GitHub',
  disconnectLabel: 'Disconnect',
  missingPluginMessage: 'Install openfox-github-copilot to use this provider.',
}

export async function register(registry: ProviderPluginRegistry): Promise<void> {
  const storageDir = join(registry.runtime.configDirectory, 'plugins', 'openfox-github-copilot')
  const credentials = new FileProviderCredentialStore(
    join(storageDir, 'credentials.json'),
    join(storageDir, 'credentials.key'),
  )
  const auth = new GitHubCopilotAuthAdapter(credentials)
  registry.registerAuth(auth)
  registry.registerTransport(new GitHubCopilotTransportAdapter(auth))
  registry.registerPreset(copilotPreset)
}
