import path from "path";
import { Command } from "commander";
import { minVersion, gt } from "semver";
import { fetch } from "undici";
import { format, logger, setLogLevel } from "../utils/logger.js";
import { readPackageJson } from "../utils/fs.js";
import { ScanResult } from "../types/result.js";
import { loadConfig } from "../config/loadConfig.js";
import { loadPlugins, runPlugins } from "../plugins/index.js";
import { ScanContext } from "../types/context.js";
import { Cache } from "../utils/cache.js";
import { handleError } from "../utils/errors.js";
import { Timer } from "../utils/output.js";

const bannedVersions = new Set(["19.0.0", "19.1.0", "19.1.1", "19.2.0"]);
const rscPackages = ["react-server-dom-webpack", "react-server-dom-turbopack"];

const normalizeVersion = (range: string | undefined): string | null => {
  if (!range) return null;
  const match = range.match(/(\d+)(\.\d+)?(\.\d+)?/);
  if (!match) return null;
  return match[0];
};

const fetchLatestVersion = async (pkgName: string): Promise<string | null> => {
  try {
    const res = await fetch(`https://registry.npmjs.org/${pkgName}/latest`, { method: "GET" });
    if (!res.ok) return null;
    const body = (await res.json()) as { version?: string; "dist-tags"?: Record<string, string> };
    return body.version || body["dist-tags"]?.latest || null;
  } catch {
    return null;
  }
};

export const performDepsCheck = async (
  context: ScanContext,
  useCache = true
): Promise<ScanResult> => {
  const cache = new Cache(context.cwd, context.config);
  const cacheKey = `deps-${context.cwd}`;

  if (useCache) {
    const cached = await cache.get<ScanResult>(cacheKey);
    if (cached) {
      if (context.debug) logger.debug("Using cached deps check result");
      return cached;
    }
  }

  try {
    const pkg = await readPackageJson(context.cwd);

    if (!pkg) {
      return {
        ok: false,
        warnings: [],
        errors: ["package.json not found. Are you in a React or Next.js project?"],
      };
    }

    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    const warnings: string[] = [];
    const errors: string[] = [];
    const issues: string[] = [];
    const outdated: Record<string, boolean | null> = {};

    if (Object.keys(allDeps).length === 0) {
      warnings.push("No dependencies found in package.json.");
    }

    const reactVersion = normalizeVersion(allDeps["react"]);

    for (const pkgName of rscPackages) {
      const version = normalizeVersion(allDeps[pkgName]);
      if (!version) continue;

      if (bannedVersions.has(version)) {
        issues.push(
          `${pkgName} ${version} is flagged. Consider upgrading away from ${[...bannedVersions].join(", ")}.`
        );
      }

      if (reactVersion && reactVersion.startsWith("19")) {
        issues.push(
          `react ${reactVersion} combined with ${pkgName} may be unsafe. Review compatibility.`
        );
      }
    }

    const packagesToCheck = ["react", ...rscPackages].filter((name) => allDeps[name]);
    for (const name of packagesToCheck) {
      const installedRange = allDeps[name];
      const installed = installedRange ? minVersion(installedRange) : null;
      const latest = await fetchLatestVersion(name);
      if (!latest) {
        warnings.push(`Could not determine latest version for ${name} (network unavailable?).`);
        outdated[name] = null;
        continue;
      }
      const isOutdated = installed ? gt(latest, installed) : false;
      outdated[name] = isOutdated;
      if (isOutdated && installed) {
        warnings.push(`${name} ${installed.version} is behind latest ${latest}.`);
      }
    }

    if (context.debug) logger.debug(`deps meta: ${JSON.stringify({ issues, outdated }, null, 2)}`);

    const result = {
      ok: errors.length === 0,
      warnings,
      errors,
      meta: { issues, outdated, reactVersion, dependenciesChecked: packagesToCheck },
    };

    if (useCache) {
      await cache.set(cacheKey, result);
    }

    return result;
  } catch (error) {
    const errorMsg = handleError(error, context.debug);
    return { ok: false, warnings: [], errors: [errorMsg] };
  }
};

export const runDeps = async (
  cwd: string,
  debug = false,
  useCache = true,
  quiet = false
): Promise<ScanResult> => {
  const timer = new Timer();
  if (debug) setLogLevel("debug");
  const config = await loadConfig(cwd);
  const context: ScanContext = { cwd, command: "deps", config, debug };
  const base = await performDepsCheck(context, useCache);
  const plugins = await loadPlugins(cwd, debug);
  const pluginResult = await runPlugins(plugins, { ...context, baseResult: base });
  const merged: ScanResult = {
    ok: base.ok && pluginResult.ok,
    warnings: [...base.warnings, ...pluginResult.warnings],
    errors: [...base.errors, ...pluginResult.errors],
    meta: { ...base.meta, ...pluginResult.meta },
  };

  if (!quiet) {
    if (!merged.ok) {
      logger.heading("Errors:");
      merged.errors.forEach((err) => logger.error(`  ${err}`));
    }
    if (merged.warnings.length > 0) {
      logger.heading("Warnings:");
      merged.warnings.forEach((warn) => logger.warn(`  ${warn}`));
    }

    const meta = (merged.meta || {}) as {
      issues?: string[];
      outdated?: Record<string, boolean | null>;
    };
    const issues = meta.issues || [];

    if (merged.ok && issues.length === 0) {
      logger.success("No known risky dependency combinations detected.");
    } else if (issues.length > 0) {
      logger.heading("Dependency issues:");
      issues.forEach((issue) => logger.warn(`- ${issue}`));
    }

    Object.entries(meta.outdated || {}).forEach(([pkgName, flag]) => {
      if (flag === null) return;
      if (flag) {
        logger.warn(`${pkgName} appears outdated compared to registry.`);
      }
    });

    logger.info(`\n${format.label("elapsed")} ${format.value(`${timer.elapsed()}ms`)}`);
  } else if (!merged.ok) {
    merged.errors.forEach((err) => logger.error(err));
  }

  return merged;
};

export const registerDepsCommand = (program: Command): void => {
  program
    .command("deps")
    .option("--debug", "Enable debug logging")
    .option("--no-cache", "Disable cache")
    .option("--quiet", "Minimal output")
    .description("Inspect dependencies for known risky versions.")
    .action(async (options: { debug?: boolean; cache?: boolean; quiet?: boolean }) => {
      const cwd = path.resolve(process.cwd());
      const result = await runDeps(
        cwd,
        Boolean(options.debug),
        options.cache !== false,
        Boolean(options.quiet)
      );
      if (!result.ok) process.exitCode = 1;
    });
};
