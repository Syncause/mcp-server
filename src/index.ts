#!/usr/bin/env node
import { spawn } from "child_process";
import fs from "fs";
import { createTransport, validateApiKey } from "./transport/index.js";
import { startMcpServer } from "./mcp/server.js";
import { logger, logFile } from "./common/logger.js";
import { certFile } from "./common/paths.js";
import { VERSION, APP_NAME } from "./common/version.js";
import { projectManager } from "./common/project-manager.js";
import { DaemonMonitor } from "./common/daemon-monitor.js";
import { state } from "./common/state.js";
import { posthog } from "./analytics/posthog.js";

/**
 * Environment Configuration
 */
interface Config {
  apiKey: string;
  mode: "local" | "remote";
  skipDaemon: boolean;
  npmRegistry?: string;
  daemonPackage: string;
  serviceProxyUrl?: string;
}

function loadConfig(): Config {
  let apiKey = process.env.API_KEY;

  if (!apiKey) {
    // Try to load from certificate file
    if (fs.existsSync(certFile)) {
      try {
        const content = fs.readFileSync(certFile, 'utf-8');
        const cert = JSON.parse(content);
        if (cert && cert.apiKey) {
          apiKey = cert.apiKey;
          logger.info(`Loaded API Key from certificate: ${certFile}`);
        }
      } catch (err: any) {
        logger.error({ err: err.message }, "Failed to read or parse certificate file");
      }
    }
  }

  if (!apiKey) {
    console.error("API_KEY environment variable is not set.");
    logger.error("API_KEY environment variable is not set and no valid certificate found. Exiting...");
    process.exit(1);
  }

  return {
    apiKey,
    mode: (process.env.MODE || "local") as "local" | "remote",
    skipDaemon: process.env.SKIP_DAEMON === "true",
    npmRegistry: process.env.NPM_REGISTRY,
    daemonPackage: process.env.DAEMON_PACKAGE || "@syncause/debug-daemon@latest",
    serviceProxyUrl: process.env.SERVICE_PROXY_URL,
  };
}

/**
 * Start Daemon Process
 */
async function startDaemon(config: Config) {
  if (config.skipDaemon) {
    logger.info("SKIP_DAEMON is set, skipping daemon start.");
    return;
  }
  logger.info("Starting a new local daemon...");

  const buildNpxArgs = () => {
    const args = ["--yes"];
    if (config.npmRegistry) {
      args.push("--registry", config.npmRegistry);
    }
    args.push(config.daemonPackage);
    if (config.serviceProxyUrl) {
      args.push("--service_proxy_url", config.serviceProxyUrl);
    }
    return args;
  };

  const isWindows = process.platform === "win32";
  if (isWindows) {
    const npxArgs = buildNpxArgs();
    const psArgs = npxArgs.map(arg => `"${arg}"`).join(", ");
    const psCommand = `Start-Process npx.cmd -ArgumentList ${psArgs} -WindowStyle Hidden`;

    logger.info(`Spawning daemon via PowerShell: ${psCommand}`);

    // Explicitly search for powershell in common locations if standard spawn fails
    const powershellPath = process.env.SystemRoot
      ? `${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
      : "powershell.exe";

    const child = spawn(powershellPath, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psCommand], {
      stdio: "ignore",
      windowsHide: true,
    });

    child.on("error", (err) => {
      logger.error({ err: err.message }, "Failed to spawn powershell daemon process");
    });

    child.unref();
  } else {
    const command = "npx";
    const args = buildNpxArgs();
    logger.info(`Spawning daemon: ${command} ${args.join(" ")}`);
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });

    child.on("error", (err) => {
      logger.error({ err: err.message }, "Failed to spawn daemon process");
    });

    child.unref();
  }
}

/**
 * Main Program Entry Point
 */
async function main() {
  const config = loadConfig();

  logger.info(`${APP_NAME} v${VERSION}`);
  logger.info(`Starting MCP server, mode: ${config.mode}, skipDaemon: ${config.skipDaemon}`);
  logger.error(`[MCP Server] ${APP_NAME} v${VERSION}, Log file: ${logFile}`);

  // Track server start 
  posthog.trackServerStart(config.apiKey, {});

  const transport = createTransport({
    mode: config.mode,
    apiKey: config.apiKey,
  });

  let daemonMonitor: DaemonMonitor | undefined;

  // Setup process exit handling
  const handleExit = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down MCP server...`);
    if (daemonMonitor) daemonMonitor.stop();
    projectManager.stopScanning();
    await posthog.shutdown();
    process.exit(0);
  };

  process.on("SIGINT", () => void handleExit("SIGINT"));
  process.on("SIGTERM", () => void handleExit("SIGTERM"));
  process.stdin.on("end", () => {
    void handleExit("stdin end");
  });
  process.stdin.resume();

  // Start business logic
  projectManager.startScanning();
  const mcpServerPromise = startMcpServer(transport, projectManager, config.apiKey);

  // Background initialization to avoid blocking MCP tools exposure
  (async () => {
    try {
      // 1. Validate API Key (Parallel with MCP server startup)
      await validateApiKey(config);
      state.isApiKeyValid = true;
      logger.info("API Key validated successfully");

      // 2. Setup/Start Daemon Monitoring
      if (config.mode === "local" && !config.skipDaemon) {
        daemonMonitor = new DaemonMonitor(
          async () => {
            logger.warn("Daemon down, restarting...");
            await startDaemon(config);
          },
          async () => {
            try {
              await transport.connect();
            } catch (err: any) {
              logger.error({ err: err.message }, "Failed to connect to daemon");
            }
          }
        );
        daemonMonitor.start();
      } else {
        logger.info(`Connecting to ${config.mode} daemon...`);
        transport.connect().catch((err: any) => {
          logger.error({ err: err.message }, `Failed to connect to ${config.mode} daemon`);
        });
      }
    } catch (err: any) {
      state.isApiKeyValid = false;
      state.apiKeyError = err.message;
      logger.error({ err: err.message }, "Background initialization encountered an error");
      // We don't exit here because the MCP server is already running and can report status to the user
    }
  })();

  await mcpServerPromise;
}

main().catch((err) => {
  logger.error({ err }, "Unhandled error in main");
  process.exit(1);
});
