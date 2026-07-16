# openfox-github-copilot

Use your **GitHub Copilot subscription** as an LLM provider in OpenFox.

The plugin adds GitHub account authentication, model discovery, and the transport required to run GitHub Copilot models from OpenFox. No OpenAI API key is required.

> This plugin uses private, undocumented GitHub Copilot endpoints that may change without notice.

## Install

Install the package directly into the OpenFox plugin directory, install its runtime dependencies, then restart OpenFox.

### macOS

```bash
PLUGIN_DIR="$HOME/Library/Application Support/openfox/plugins/openfox-github-copilot" && mkdir -p "$PLUGIN_DIR" && npx --yes pacote extract openfox-github-copilot "$PLUGIN_DIR" && npm install --omit=dev --prefix "$PLUGIN_DIR"
```

Plugin directory:

```text
~/Library/Application Support/openfox/plugins/openfox-github-copilot
```

### Linux

```bash
PLUGIN_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/openfox/plugins/openfox-github-copilot" && mkdir -p "$PLUGIN_DIR" && npx --yes pacote extract openfox-github-copilot "$PLUGIN_DIR" && npm install --omit=dev --prefix "$PLUGIN_DIR"
```

Plugin directory:

```text
${XDG_CONFIG_HOME:-~/.config}/openfox/plugins/openfox-github-copilot
```

### Windows PowerShell

```powershell
$dir = Join-Path $env:APPDATA 'openfox\plugins\openfox-github-copilot'; New-Item -ItemType Directory -Force $dir | Out-Null; npx --yes pacote extract openfox-github-copilot $dir; npm install --omit=dev --prefix $dir
```

Plugin directory:

```text
%APPDATA%\openfox\plugins\openfox-github-copilot
```

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

## Current version

1.0.1

## Use

Restart OpenFox, open the onboarding page, select **GitHub Copilot**, and connect your account.

OpenFox can then keep the provider configuration minimal:

The plugin resolves the endpoint, backend, authentication adapter, transport adapter, and available models.

## License

MIT
