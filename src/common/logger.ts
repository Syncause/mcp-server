import pino from "pino";
import path from "path";
import os from "os";
import fs from "fs";

/**
 * Get the appropriate log directory based on the operating system
 * - Windows: %APPDATA%\syncause-debug\logs
 * - macOS: ~/Library/Application Support/syncause-debug/logs
 * - Linux: ~/.local/share/syncause-debug/logs
 */
import { logDir } from "./paths.js";

// Include PID in log filename to avoid conflicts when multiple IDE instances are running
const logFile = path.join(logDir, `mcp-server-${process.pid}.log`);

// Export log file path for reference
export { logFile };

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: {
    targets: [
      {
        target: "pino/file",
        level: process.env.LOG_LEVEL || "info",
        options: {
          destination: logFile,
          mkdir: true,
        },
      },
    ],
  },
});
