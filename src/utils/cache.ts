import path from "path";
import { promises as fs } from "fs";
import { pathExists, ensureDir, readJsonFile } from "./fs.js";
import { ReactscanConfig } from "../config/loadConfig.js";

export type CacheEntry<T> = {
  data: T;
  timestamp: number;
};

export class Cache {
  private cacheDir: string;
  private config: ReactscanConfig;

  constructor(cwd: string, config: ReactscanConfig) {
    this.cacheDir = path.join(cwd, ".reactscan", "cache");
    this.config = config;
  }

  private getCachePath(key: string): string {
    const sanitized = key.replace(/[^a-z0-9]/gi, "_");
    return path.join(this.cacheDir, `${sanitized}.json`);
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.config.cache?.enabled) return null;

    const cachePath = this.getCachePath(key);
    if (!(await pathExists(cachePath))) return null;

    try {
      const entry = await readJsonFile<CacheEntry<T>>(cachePath);
      if (!entry) return null;

      const ttl = this.config.cache?.ttl ?? 1800000;
      const age = Date.now() - entry.timestamp;

      if (age > ttl) {
        await fs.unlink(cachePath).catch(() => {});
        return null;
      }

      return entry.data;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, data: T): Promise<void> {
    if (!this.config.cache?.enabled) return;

    const cachePath = this.getCachePath(key);
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
    };

    try {
      await ensureDir(this.cacheDir);
      await fs.writeFile(cachePath, JSON.stringify(entry, null, 2), "utf8");
    } catch {
      // Silently fail cache writes
    }
  }

  async clear(): Promise<void> {
    if (!(await pathExists(this.cacheDir))) return;

    try {
      const files = await fs.readdir(this.cacheDir);
      await Promise.all(files.map((file) => fs.unlink(path.join(this.cacheDir, file))));
    } catch {
      // Silently fail cache clearing
    }
  }
}
