import path from "path";
import os from "os";
import fs from "fs";

/**
 * Get the appropriate base directory based on the operating system
 * - Windows: %APPDATA%\syncause-debug
 * - macOS: ~/Library/Application Support/syncause-debug
 * - Linux: ~/.local/share/syncause-debug
 */
export function getBaseDirectory(): string {
  const platform = os.platform();
  const homeDir = os.homedir();

  let baseDir: string;

  if (platform === "win32") {
    // Windows: use APPDATA
    baseDir = process.env.APPDATA || path.join(homeDir, "AppData", "Roaming");
  } else if (platform === "darwin") {
    // macOS: use Application Support
    baseDir = path.join(homeDir, "Library", "Application Support");
  } else {
    // Linux and others: use XDG_DATA_HOME or fallback to ~/.local/share
    baseDir = process.env.XDG_DATA_HOME || path.join(homeDir, ".local", "share");
  }

  return path.join(baseDir, "syncause-debug");
}

export const baseDir = getBaseDirectory();
export const logDir = path.join(baseDir, "logs");
export const lockFile = path.join(baseDir, "daemon.lock");
export const certFile = path.join(baseDir, "cert.json");
export const configFile = path.join(baseDir, "syncause.json");

// Ensure directories exist
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}
