# openfox-github-copilot

Use your **GitHub Copilot subscription** as an LLM provider in OpenFox.

The plugin adds GitHub account authentication, model discovery, and the transport required to run GitHub Copilot models from OpenFox. No OpenAI API key is required.

> This plugin uses private, undocumented GitHub Copilot endpoints that may change without notice.

## Install

### macOS / Linux

```bash
curl -fsSL https://raw.githubusercontent.com/JamesDAdams/openfox-github-copilot/main/install.sh | bash
```

For OpenFox dev mode (`OPENFOX_DEV=true`):

```bash
OPENFOX_DEV=true curl -fsSL https://raw.githubusercontent.com/JamesDAdams/openfox-github-copilot/main/install.sh | bash
```

### Windows PowerShell

```powershell
$dir = Join-Path $env:APPDATA 'openfox\plugins\openfox-github-copilot'; New-Item -ItemType Directory -Force $dir | Out-Null; npx --yes pacote extract openfox-github-copilot $dir; npm install --omit=dev --prefix $dir
```

### Manual install

| OS | Plugin directory |
|----|-----------------|
| macOS | `~/Library/Application Support/openfox/plugins/openfox-github-copilot` |
| Linux | `${XDG_CONFIG_HOME:-~/.config}/openfox/plugins/openfox-github-copilot` |
| Windows | `%APPDATA%\openfox\plugins\openfox-github-copilot` |

Install the package directly into the plugin directory, install its runtime dependencies, then restart OpenFox.

## Development mode

When OpenFox runs with `OPENFOX_DEV=true`, replace `openfox` with `openfox-dev` in the paths above.

For local plugin development, a symlink is enough:

```bash
mkdir -p "$HOME/Library/Application Support/openfox-dev/plugins" && ln -sfn /path/to/openfox-github-copilot "$HOME/Library/Application Support/openfox-dev/plugins/openfox-github-copilot"
```

Build the plugin before starting OpenFox:

```bash
npm install && npm run build
```

## Use

Restart OpenFox, open the onboarding page, select **GitHub Copilot**, and connect your account.

OpenFox can then keep the provider configuration minimal:

The plugin resolves the endpoint, backend, authentication adapter, transport adapter, and available models.

## License

MIT
