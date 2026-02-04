# Syncause Debug MCP Server

Syncause captures **runtime truth** (stack traces, logs, request/response, function arguments, and key variable values) and makes it queryable by AI agents via **MCP**—so the agent debugs with evidence instead of guessing.

**Use it with:**
- **Syncause IDE Extension** (recommended) — capture runtime data in your IDE, then query it via MCP.
- **Syncause Debugger Skill** — a prompt/workflow layer that calls this MCP server.

## Prerequisites
- Get a free API key at [syn-cause.com/dashboard](https://syn-cause.com/dashboard)
- Node.js 22.22.0+ or newer

## Installation
Common MCP Configuration works in most of the tools:

```json
{
  "mcpServers": {
    "syncause-debug-mcp": {
      "command": "npx",
      "args": ["-y", "@syncause/debug-mcp@latest"],
      "env": { "API_KEY": "YOUR_API_KEY" }
    }
  }
}
```

### Configure in your client

<details>
<summary><b>Install in Cursor</b></summary>

Edit `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global):

```json
{
  "mcpServers": {
    "syncause-debug-mcp": {
      "command": "npx",
      "args": ["-y", "@syncause/debug-mcp@latest"],
      "env": { "API_KEY": "YOUR_API_KEY" }
    }
  }
}
```

</details>

<details>
<summary><b>Install in VS Code</b></summary>

Edit `.vscode/settings.json`:

```json
{
  "mcp.servers": {
    "syncause-debug-mcp": {
      "command": "npx",
      "args": ["-y", "@syncause/debug-mcp@latest"],
      "env": { "API_KEY": "YOUR_API_KEY" }
    }
  }
}
```

</details>

<details>
<summary><b>Install in Antigravity</b></summary>

Edit `~/.gemini/antigravity/mcp_config.json` (Global):

```json
{
  "mcp.servers": {
    "syncause-debug-mcp": {
      "command": "npx",
      "args": ["-y", "@syncause/debug-mcp@latest"],
      "env": { "API_KEY": "YOUR_API_KEY" }
    }
  }
}
```

</details>

<details>
<summary><b>Install in Claude Code</b></summary>

Run this command (local stdio server):

```sh
API_KEY=YOUR_API_KEY claude mcp add syncause-debug-mcp -- npx -y @syncause/debug-mcp@latest
```

</details>

<details>
<summary><b>Install in OpenAI Codex (CLI)</b></summary>

```sh
API_KEY=YOUR_API_KEY codex mcp add syncause-debug-mcp --command "npx -y @syncause/debug-mcp@latest"
```

</details>

<details>
<summary><b>Install in Gemini CLI</b></summary>

```sh
API_KEY=YOUR_API_KEY gemini mcp add syncause-debug-mcp -- npx -y @syncause/debug-mcp@latest
```

</details>

<details>
<summary><b>Install in Windsurf</b></summary>

Edit `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "syncause-debug-mcp": {
      "command": "npx",
      "args": ["-y", "@syncause/debug-mcp@latest"],
      "env": { "API_KEY": "YOUR_API_KEY" }
    }
  }
}
```

</details>

<details>
<summary><b>Install in Goose</b></summary>

Edit `~/.config/goose/config.yaml`:

```yaml
extensions:
  syncause-debug-mcp:
    type: stdio
    name: Syncause Debug MCP
    enabled: true
    timeout: 300
    cmd: npx
    args: ["-y", "@syncause/debug-mcp@latest"]
    envs:
      API_KEY: "YOUR_API_KEY"
```

</details>

<details>
<summary><b>Install in Opencode</b></summary>

Add this to your Opencode config:

```json
{
  "mcp": {
    "syncause-debug-mcp": {
      "type": "local",
      "command": ["npx", "-y", "@syncause/debug-mcp@latest"],
      "env": { "API_KEY": "YOUR_API_KEY" },
      "enabled": true
    }
  }
}
```

</details>


## Troubleshooting

- **`npx: command not found`** → install Node.js (or ensure your shell can find it).
- **Server won’t start in your client** → try running the MCP server directly in a terminal first:
  ```bash
  npx -y @syncause/debug-mcp@latest
  ```
- **Env not applied** → many clients require restarting after config changes.

## Security Notes

- Your `API_KEY` is sensitive. Avoid committing MCP config files to Git.
- Prefer project-level configs only when you need per-repo isolation.
