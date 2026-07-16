import type {
  ProviderAccessContext,
  ProviderAuthAdapter,
  ProviderAuthStatus,
  ProviderLoginChallenge,
} from 'openfox/provider'
import type { ProviderCredentialStore } from '../credentials/credential-store.js'
import { GitHubAccountTokenClient } from './github-account.js'

export interface GitHubCopilotAuthOptions {
  fetcher?: typeof fetch
  now?: () => number
}

export class GitHubCopilotAuthAdapter implements ProviderAuthAdapter {
  readonly id = 'github-copilot-auth'
  private readonly activeLogins = new Map<string, {
    challenge: ProviderLoginChallenge
    completion: Promise<{ credentialRef: string }>
  }>()
  private readonly tokens: GitHubAccountTokenClient

  constructor(
    private readonly credentials: ProviderCredentialStore,
    options: GitHubCopilotAuthOptions = {},
  ) {
    this.tokens = new GitHubAccountTokenClient(credentials, options)
  }

  async beginLogin(context: { providerId: string }): Promise<{
    challenge: ProviderLoginChallenge
    completion: Promise<{ credentialRef: string }>
  }> {
    const existing = this.activeLogins.get(context.providerId)
    if (existing) return existing

    const { challenge: device, completion: oauthCompletion } = await this.tokens.beginDeviceLogin()

    const challenge: ProviderLoginChallenge = {
      mode: 'device',
      verificationUrl: device.verification_uri,
      userCode: device.user_code,
      instructions: `Please go to ${device.verification_uri} and enter code ${device.user_code} to authorize GitHub Copilot.`,
      expiresAt: new Date(Date.now() + device.expires_in * 1000).toISOString(),
      intervalSeconds: device.interval || 5,
    }

    const completion = (async () => {
      try {
        const oauthToken = await oauthCompletion
        const username = await this.tokens.fetchUsername(oauthToken)
        const credentialRef = await this.credentials.create({
          oauthToken,
          username,
        })
        return { credentialRef }
      } finally {
        this.activeLogins.delete(context.providerId)
      }
    })()

    const loginObj = { challenge, completion }
    this.activeLogins.set(context.providerId, loginObj)
    return loginObj
  }

  async getStatus(context: { providerId: string; credentialRef?: string }): Promise<ProviderAuthStatus> {
    if (!context.credentialRef) return { state: 'disconnected' }

    const credential = await this.credentials.get(context.credentialRef) as { username?: string; oauthToken?: string } | undefined
    if (!credential) return { state: 'disconnected' }

    try {
      const tokenData = await this.tokens.fetchCopilotToken(credential.oauthToken!)
      if (tokenData.token) {
        return { state: 'connected', accountLabel: credential.username }
      }
      return { state: 'error', accountLabel: credential.username, error: 'GitHub Copilot subscription not active' }
    } catch (err) {
      return {
        state: 'expired',
        accountLabel: credential.username,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  async getAccessContext(credentialRef: string): Promise<ProviderAccessContext> {
    const credential = await this.tokens.getValidCredential(credentialRef)
    return {
      accessToken: credential.copilotToken,
      headers: {
        Authorization: `Bearer ${credential.copilotToken}`,
        'Copilot-Integration-Id': 'vscode-chat',
        'Editor-Version': 'vscode/1.91.0',
        'Editor-Plugin-Version': 'copilot-chat/1.250.0',
        'User-Agent': 'GithubCopilot/1.250.0',
      },
    }
  }

  async getOAuthToken(credentialRef: string): Promise<string> {
    const credential = await this.credentials.get(credentialRef) as { oauthToken?: string } | undefined
    if (!credential?.oauthToken) throw new Error('OAuth token not found')
    return credential.oauthToken
  }

  async logout(credentialRef: string): Promise<void> {
    await this.credentials.delete(credentialRef)
  }
}
