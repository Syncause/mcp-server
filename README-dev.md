# Syncause Debug MCP Server

A lightweight custom MCP (Model Context Protocol) server implementation that supports local communication (Named Pipes/UNIX Sockets) and HTTP communication, with automatic Daemon process management capabilities.

## Features

- ✨ **Smart Connection Management**: Automatically detects the Daemon service at startup. In `local` mode, if the connection fails and `SKIP_DAEMON` is not set, it automatically launches the Daemon in `detached` mode.
- 🔄 **Rapid Failure Detection**: Real-time monitoring of Daemon liveness via PID signal checks (Signal 0) every 5 seconds, eliminating reliance on high-latency network heartbeats.
- 🛡️ **Self-Healing**: In non-`SKIP_DAEMON` mode, if the Daemon process is detected to have died, it immediately and automatically restarts the Daemon process.
- 🔗 **Smart State Recovery**: Uses a state machine to manage Daemon status (Alive/Dead). Connection and Ping verification are initiated only when the process is detected recovering from dead to alive (Dead -> Alive), ensuring timely and accurate communication restoration.
- 🛠️ **MCP Tool Forwarding**: Built-in MCP Server that automatically forwards Tool calls to the background Daemon process via RPC for handling.
- 🌐 **Multi-Mode Support**: Supports local communication (Windows Named Pipes/UNIX Sockets) and remote HTTP mode.
- 📝 **Smart Log Management**: Logs are automatically stored in the operating system's standard user data directory, with filenames containing the process PID, supporting multiple IDE instances running simultaneously without conflict.

## Installation

```bash
# Clone repository
git clone <repository-url>
cd syncause-debug-mcp

# Install dependencies
npm install

# Build project
npm run build
```

## Distribution and Deployment

This module supports launching directly via `npx`, making it easy to configure in MCP clients (such as Claude Desktop).

### 1. Publish to NPM (Developer)

When the new version is ready, run `npm run release` to create a new commit and tag. Then, push the new tag to the remote repository with `git push --follow-tags`. The CI/CD pipeline will automatically publish the new version to NPM.


### 2. Configure in MCP Client (User)

Taking Cursor as an example, add the following to `.cursor/mcp.json`:

{
  "mcpServers": {
    "syncause-debug": {
      "command": "npx",
      "args": ["-y", "@syncause/debug-mcp@latest"],
      "env": {
        "API_KEY": "your_api_key"
      }
    }
  }
}
```

## Environment Variable Configuration

| Variable Name | Description | Default Value |
| :--- | :--- | :--- |
| `API_KEY` | Key used for RPC authentication | - |
| `MODE` | Running mode: `local` (UDS) or `remote` (HTTP) | `local` |
| `SKIP_DAEMON` | If `true`, does not automatically start or restart the Daemon process | `false` |
| `NPM_REGISTRY` | NPM Registry address used when starting the Daemon | `https://registry.npmjs.org/` |
| `DAEMON_PACKAGE` | Specifies Daemon package name and version | `@syncause/debug-daemon@latest` |
| `SERVICE_PROXY_URL` | Service proxy URL, passed to the Daemon process | - |

## Daemon Automatic Management Logic

1. **Startup Phase**:
   - Attempts to connect to the configured address.
   - If connection fails and `SKIP_DAEMON="false"`: Starts the Daemon process via `spawn`, waits 2 seconds, then attempts to connect and starts monitoring.
2. **Running Phase (Liveness Monitoring)**:
   - **PID Signal Check**: In `local` mode, checks if the Daemon process is alive every 5s via `process.kill(pid, 0)`.
   - **State Transition**:
     - **Death Detected (Alive -> Dead)**: Once the process is detected to have disappeared, the restart flow is immediately triggered.
     - **Recovery Confirmed (Dead -> Alive)**: In the detection cycle after restart, once the new process PID is confirmed active, `transport.connect()` is immediately executed for communication verification.
3. **Self-Healing**:
   - The entire "Detect-Restart-Verify" process is automated and typically restores service within 5-10 seconds.

## Process Lifecycle Management

### MCP Server Process
- **Startup Method**: Started by the IDE client via `npx`.
- **Exit Mechanism**: Exits gracefully with the client closure (listens for stdin 'end' events and SIGINT/SIGTERM).
- **Lifecycle**: Bound to the IDE instance.

### Daemon Process
- **Startup Method**: Started by the MCP Server in `detached` mode.
- **Independence**: Does not depend on the MCP Server process; even if the MCP Server exits, the Daemon continues to run and can be shared by multiple IDE instances.
- **Lifecycle**: Runs independently until manually stopped or system restart.

## Log File Location

Logs are stored in the `syncause-debug/logs/` directory under the operating system's standard user data directory. The filename format is `mcp-server-{pid}.log`.