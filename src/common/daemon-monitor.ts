import fs from "fs";
import { lockFile } from "./paths.js";
import { logger } from "./logger.js";

export class DaemonMonitor {
  private monitorTimer?: NodeJS.Timeout;

  private isAlive: boolean | undefined = undefined;
  private isChecking = false;

  constructor(
    private onDaemonDown: () => Promise<void>,
    private onDaemonAlive: () => Promise<void>,
    private intervalMs: number = 5000
  ) { }

  /**
   * Start monitoring the daemon process via PID signal 0
   */
  start() {
    this.stop();
    logger.info({ lockFile, intervalMs: this.intervalMs }, "Starting daemon monitor...");

    const check = async () => {
      if (this.isChecking) return;
      this.isChecking = true;

      try {
        const currentlyAlive = await this.checkDaemonAlive();

        if (this.isAlive !== currentlyAlive) {
          const wasUndefined = this.isAlive === undefined;
          this.isAlive = currentlyAlive;

          if (currentlyAlive) {
            logger.info(wasUndefined ? "Daemon is alive." : "Daemon process detected as back online. Sending ping...");
            await this.onDaemonAlive();
          } else {
            logger.warn(wasUndefined ? "Daemon is not running." : "Daemon process detected as down via PID check. Triggering recovery...");
            await this.onDaemonDown();
          }
        }
      } finally {
        this.isChecking = false;
      }
    };

    check(); // Run immediately
    this.monitorTimer = setInterval(check, this.intervalMs);
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = undefined;
    }
  }

  /**
   * Check if the daemon process is alive using signal 0
   */
  private async checkDaemonAlive(): Promise<boolean> {
    try {
      if (!fs.existsSync(lockFile)) {
        logger.debug("Daemon lock file not found");
        return false;
      }

      const content = (await fs.promises.readFile(lockFile, "utf8")).trim();
      if (!content) {
        logger.debug("Daemon lock file is empty, skipping this check");
        return this.isAlive ?? false; // Keep last state if empty
      }

      const pid = parseInt(content, 10);
      if (isNaN(pid)) {
        logger.warn({ content }, "Invalid PID in lock file");
        return false;
      }

      try {
        // Signal 0 doesn't kill the process but checks if it exists
        process.kill(pid, 0);
        return true;
      } catch (e: any) {
        // ESRCH means the process doesn't exist
        return e.code !== "ESRCH";
      }
    } catch (err: any) {
      logger.error({ err: err.message }, "Error checking daemon status");
      return false;
    }
  }
}
