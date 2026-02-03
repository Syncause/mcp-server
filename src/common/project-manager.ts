import fs from "fs";
import path from "path";
import { logger } from "./logger.js";
import { configFile } from "./paths.js";
import { v4 as uuidv4 } from "uuid";

export interface ProjectConfig {
  projectPath: string;
  projectId: string;
  projectName: string;
}

export class ProjectManager {
  private cache: Map<string, ProjectConfig> = new Map();
  private scanInterval: number = 5 * 60 * 1000;
  private timer?: NodeJS.Timeout;
  private lastScanTime: number = 0;
  private readonly MIN_SCAN_INTERVAL_MS = 5000;

  constructor() {
  }

  public async scan(force: boolean = false) {
    // Prevent frequent scans: skip if the time since the last scan is less than MIN_SCAN_INTERVAL_MS
    const now = Date.now();
    if (!force && now - this.lastScanTime < this.MIN_SCAN_INTERVAL_MS) {
      logger.debug(`Skipping scan, last scan was ${now - this.lastScanTime}ms ago`);
      return;
    }

    try {
      try {
        await fs.promises.access(configFile);
      } catch (err) {
        logger.info(`Project config file not found, creating new one: ${configFile}`);
        try {
          const dir = path.dirname(configFile);
          if (!fs.existsSync(dir)) {
            await fs.promises.mkdir(dir, { recursive: true });
          }
          await fs.promises.writeFile(configFile, "[]", "utf-8");
        } catch (createErr) {
          logger.error({ err: createErr }, `Failed to create config file: ${configFile}`);
          return;
        }
      }

      const content = await fs.promises.readFile(configFile, "utf-8");
      let configs: ProjectConfig[] = [];
      try {
        configs = JSON.parse(content);
      } catch (e) {
        logger.error(`Failed to parse config file: ${e}`);
        return;
      }

      const newCache = new Map<string, ProjectConfig>();
      for (const config of configs) {
        // Support both 'projectPath' and legacy 'workspace' field for backward compatibility
        const pPath = config.projectPath || (config as any).workspace;
        if (pPath && config.projectId) {
          // Normalize path for comparison
          const normalizedPath = path.normalize(pPath).toLowerCase();
          // Ensure structure is correct
          const normalizedConfig: ProjectConfig = {
            projectPath: pPath,
            projectId: config.projectId,
            projectName: config.projectName || path.basename(pPath)
          };
          newCache.set(normalizedPath, normalizedConfig);
        }
      }

      // Check if cache has changed
      let hasChanged = newCache.size !== this.cache.size;
      if (!hasChanged) {
        for (const [key, value] of newCache) {
          const oldVal = this.cache.get(key);
          if (!oldVal || oldVal.projectId !== value.projectId) {
            hasChanged = true;
            break;
          }
        }
      }

      if (hasChanged) {
        this.cache = newCache;
        logger.info(
          {
            count: this.cache.size,
            projects: Array.from(newCache.keys())
          },
          "Project cache updated"
        );
      }

      this.lastScanTime = now;
    } catch (err) {
      logger.error({ err }, "Failed to scan project config file");
    }
  }

  public startScanning(intervalMs?: number) {
    if (intervalMs) this.scanInterval = intervalMs;

    this.scan(true); // Initial scan (force)

    this.timer = setInterval(() => {
      this.scan();
    }, this.scanInterval);

    logger.info(`Started scanning project config every ${this.scanInterval / 1000}s`);
  }

  public stopScanning() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  public hasProjectId(projectId: string): boolean {
    for (const project of this.cache.values()) {
      if (project.projectId === projectId) {
        return true;
      }
    }
    return false;
  }

  public async ensureProject(projectPath: string): Promise<ProjectConfig> {
    const normalizedPath = path.normalize(projectPath).toLowerCase();

    // 1. Try cache
    let config = this.cache.get(normalizedPath);
    if (config) return config;

    // 2. Try force scan (in case file changed externally)
    await this.scan(true);
    config = this.cache.get(normalizedPath);
    if (config) return config;

    // 3. Create new
    const newConfig: ProjectConfig = {
      projectPath: projectPath, // Store original path style? Or normalized? Usually original
      projectId: uuidv4(),
      projectName: path.basename(projectPath)
    };

    logger.info({ newConfig }, "Creating new project configuration");

    // 4. Save to file
    // Lock or race condition handling could be improved, but for now: read-modify-write
    let currentConfigs: ProjectConfig[] = [];
    try {
      if (fs.existsSync(configFile)) {
        const content = await fs.promises.readFile(configFile, 'utf-8');
        currentConfigs = JSON.parse(content);
      }
    } catch (e) {
      logger.warn(`Could not read existing config for append, starting fresh,err: ${e}`);
    }

    currentConfigs.push(newConfig);

    // Ensure dir exists
    const dir = path.dirname(configFile);
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true });
    }

    await fs.promises.writeFile(configFile, JSON.stringify(currentConfigs, null, 2), 'utf-8');

    // 5. Update cache
    this.cache.set(normalizedPath, newConfig);

    return newConfig;
  }

  public getAllProjects(): ProjectConfig[] {
    return Array.from(this.cache.values());
  }
}

export const projectManager = new ProjectManager();
