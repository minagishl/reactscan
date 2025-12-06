import path from "path";
import { pathToFileURL } from "url";
import { pathExists } from "../utils/fs.js";
import { logger } from "../utils/logger.js";
import { ReactscanPlugin } from "./types.js";
import { ScanContext } from "../types/context.js";
import { ScanResult } from "../types/result.js";
import { loadConfig } from "../config/loadConfig.js";

const loadUserPlugins = async (
  cwd: string,
  debug: boolean,
  existingNames: Set<string>
): Promise<ReactscanPlugin[]> => {
  const config = await loadConfig(cwd);
  const pluginsDir = path.isAbsolute(config.pluginsDir || "plugins")
    ? config.pluginsDir || "plugins"
    : path.join(cwd, config.pluginsDir || "plugins");
  const plugins: ReactscanPlugin[] = [];

  if (!(await pathExists(pluginsDir))) {
    if (debug) logger.debug(`Plugins directory not found: ${pluginsDir}`);
    return plugins;
  }

  try {
    const entries = await (await import("fs/promises")).readdir(pluginsDir);
    for (const file of entries) {
      if (!file.endsWith(".js") && !file.endsWith(".mjs")) continue;
      const fullPath = path.join(pluginsDir, file);
      try {
        const mod = await import(pathToFileURL(fullPath).toString());
        if (mod.default && mod.default.name && typeof mod.default.run === "function") {
          if (existingNames.has(mod.default.name)) continue;
          plugins.push(mod.default as ReactscanPlugin);
          existingNames.add(mod.default.name);
          if (debug) logger.debug(`Loaded plugin: ${mod.default.name}`);
        }
      } catch (err) {
        logger.warn(`Failed to load plugin ${file}: ${(err as Error).message}`);
      }
    }
  } catch (err) {
    if (debug) logger.debug(`Plugin directory read failed: ${(err as Error).message}`);
  }

  return plugins;
};

export const loadPlugins = async (cwd: string, debug: boolean): Promise<ReactscanPlugin[]> => {
  const plugins: ReactscanPlugin[] = [];
  const names = new Set(plugins.map((p) => p.name));
  const userPlugins = await loadUserPlugins(cwd, debug, names);
  return [...plugins, ...userPlugins];
};

export const runPlugins = async (
  plugins: ReactscanPlugin[],
  context: ScanContext
): Promise<ScanResult> => {
  const warnings: string[] = [];
  const errors: string[] = [];
  const meta: Record<string, unknown>[] = [];

  for (const plugin of plugins) {
    try {
      const result = await plugin.run(context);
      if (result.warnings) warnings.push(...result.warnings.map((w) => `[${plugin.name}] ${w}`));
      if (result.errors) errors.push(...result.errors.map((e) => `[${plugin.name}] ${e}`));
      if (result.meta) meta.push({ plugin: plugin.name, ...result.meta });
    } catch (err) {
      errors.push(`[${plugin.name}] ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { ok: errors.length === 0, warnings, errors, meta: { plugins: meta } };
};
